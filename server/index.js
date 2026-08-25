require('dotenv').config();
const dns = require('dns');
// Render's network doesn't reliably support outbound IPv6, but Node's
// default DNS resolution order can still return an IPv6 address first
// for smtp.gmail.com even with Nodemailer's `family: 4` option set.
// This forces IPv4 to be preferred at the Node runtime level, which is
// the more reliable fix for the "connect ENETUNREACH 2607:f8b0:..."
// error seen when sending verification emails from Render.
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');

const User = require('./models/User');
const Password = require('./models/Password');
const AuditLog = require('./models/AuditLog');

const app = express();

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected!'))
  .catch(err => console.log('Error:', err));

// Email transporter setup
// Using explicit SMTP settings (instead of service: 'gmail') with family: 4
// to force IPv4. Render's network doesn't reliably support outbound IPv6,
// and Node tries IPv6 first by default - this was causing
// "connect ENETUNREACH" errors when reaching Gmail's servers.
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  family: 4,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ==================
// AUTH ROUTES
// ==================

// Register
app.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists!' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user - auto-verified for now.
    // Email verification is temporarily disabled: Render's free tier
    // blocks/times-out outbound SMTP connections, so sending the
    // verification email was failing here. The account creation and
    // login flow itself is unaffected - only the extra "click a link
    // in your email" step is skipped.
    const user = new User({
      email,
      password: hashedPassword,
      isVerified: true,
    });
    await user.save();

    res.json({ message: 'Registration successful! You can log in now.' });
  } catch (error) {
    console.log('Register error:', error.message);
    res.status(500).json({ message: 'Registration failed!' });
  }
});

// Verify Email
app.get('/verify/:token', async (req, res) => {
  try {
    const user = await User.findOne({ verificationToken: req.params.token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token!' });
    }
    user.isVerified = true;
    user.verificationToken = null;
    await user.save();
    res.json({ message: 'Email verified successfully! You can now login.' });
  } catch (error) {
    res.status(500).json({ message: 'Verification failed!' });
  }
});

// Login
app.post('/login', async (req, res) => {
  try {
    const { email, password, twoFactorCode } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const device = req.headers['user-agent'] || 'Unknown';

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found!' });
    }

    // Check if verified
    if (!user.isVerified) {
      return res.status(400).json({ message: 'Please verify your email first!' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Log failed attempt
      await new AuditLog({
        userId: user._id,
        email,
        ipAddress,
        device,
        status: 'failed',
        reason: 'Wrong password',
      }).save();
      return res.status(400).json({ message: 'Wrong password!' });
    }

    // Check 2FA if enabled
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return res.status(400).json({ message: '2FA code required!', requires2FA: true });
      }
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: twoFactorCode,
      });
      if (!verified) {
        await new AuditLog({
          userId: user._id,
          email,
          ipAddress,
          device,
          status: 'failed',
          reason: 'Wrong 2FA code',
        }).save();
        return res.status(400).json({ message: 'Invalid 2FA code!' });
      }
    }

    // Create JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // Log successful login
    await new AuditLog({
      userId: user._id,
      email,
      ipAddress,
      device,
      status: 'success',
    }).save();

    res.json({ token, userId: user._id, email: user.email });
  } catch (error) {
    console.log('Login error:', error.message);
    res.status(500).json({ message: 'Login failed!' });
  }
});

// ==================
// 2FA ROUTES
// ==================

// Setup 2FA
app.post('/2fa/setup', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    // If 2FA is already enabled, don't silently generate a new secret -
    // that would invalidate the user's existing authenticator app entry
    // without warning them.
    if (user.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is already enabled on this account.' });
    }

    const secret = speakeasy.generateSecret({ name: `SecureVault (${user.email})` });
    user.twoFactorSecret = secret.base32;
    await user.save();

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ qrCode, secret: secret.base32 });
  } catch (error) {
    res.status(500).json({ message: '2FA setup failed!' });
  }
});

// Enable 2FA
app.post('/2fa/enable', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: req.body.code,
    });

    if (!verified) {
      return res.status(400).json({ message: 'Invalid code!' });
    }

    user.twoFactorEnabled = true;
    await user.save();
    res.json({ message: '2FA enabled successfully!' });
  } catch (error) {
    res.status(500).json({ message: '2FA enable failed!' });
  }
});

// ==================
// VAULT (ZERO-KNOWLEDGE KEY) ROUTES
// ==================

// Generate and save a per-user salt the first time they set a vault passphrase
app.post('/vault/setup', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (user.vaultSalt) {
      return res.status(400).json({ message: 'Vault already set up!' });
    }

    // Salt is not secret - it's fine for the server to generate and store it.
    // Only the passphrase (never sent here) has to stay secret.
    user.vaultSalt = crypto.randomBytes(16).toString('hex');
    await user.save();

    res.json({ vaultSalt: user.vaultSalt });
  } catch (error) {
    res.status(500).json({ message: 'Vault setup failed!' });
  }
});

// Saves a "canary" - a known string encrypted client-side with the newly
// derived key. This lets the app later verify a passphrase is correct
// BEFORE trusting it, instead of silently accepting whatever key is
// sitting in sessionStorage. The server never learns the passphrase or
// the plaintext canary, only the ciphertext.
app.post('/vault/confirm', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { vaultCheck } = req.body;
    const user = await User.findById(decoded.id);

    user.vaultCheck = vaultCheck;
    await user.save();

    res.json({ message: 'Vault confirmed!' });
  } catch (error) {
    res.status(500).json({ message: 'Vault confirm failed!' });
  }
});

// Fetch the user's existing salt + canary (needed to re-derive and verify
// the key on every login)
app.get('/vault/salt', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    res.json({ vaultSalt: user.vaultSalt || null, vaultCheck: user.vaultCheck || null });
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch vault salt!' });
  }
});

// ==================
// PASSWORD ROUTES
// ==================

// Get all passwords
app.get('/passwords', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const passwords = await Password.find({ userId: decoded.id });
    res.json(passwords);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch passwords!' });
  }
});

// Save password
app.post('/passwords', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const password = new Password({ ...req.body, userId: decoded.id });
    await password.save();
    res.json(password);
  } catch (error) {
    res.status(500).json({ message: 'Failed to save password!' });
  }
});

// Delete password
app.delete('/passwords/:id', async (req, res) => {
  try {
    await Password.findByIdAndDelete(req.params.id);
    res.json({ message: 'Password deleted!' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete password!' });
  }
});

// Update password
app.put('/passwords/:id', async (req, res) => {
  try {
    const password = await Password.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(password);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update password!' });
  }
});

// ==================
// AUDIT LOG ROUTES
// ==================

// Get audit logs
app.get('/audit', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const logs = await AuditLog.find({ userId: decoded.id }).sort({ timestamp: -1 }).limit(20);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch audit logs!' });
  }
});

// ==================
// SERVER START
// ==================

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`SecureVault server running on port ${PORT}`);
});