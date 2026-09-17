require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const User = require('./models/User');
const Password = require('./models/Password');
const AuditLog = require('./models/AuditLog');

// ==================
// STARTUP CHECKS
// ==================
// Fail loudly at boot instead of silently running with a weak/missing
// secret. 32 bytes (64 hex chars) is a reasonable floor for an HMAC key;
// generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
// and set it as a real secret in your host's env var UI (Render/Vercel),
// never committed to the repo.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET is missing or too short (need 32+ chars). Refusing to start with a weak secret.'
  );
}

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(helmet({
  // helmet's default CSP is meant for pages that render HTML themselves;
  // this is a JSON API with no views, so a locked-down default-src covers
  // it without needing a bespoke policy. The frontend (a separate static
  // site on Vercel) should get its own CSP configured there.
  contentSecurityPolicy: {
    directives: { defaultSrc: ["'none'"] },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
  },
}));
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected!'))
  .catch(err => console.log('Error:', err));

// ==================
// JWT CONFIG
// ==================

const JWT_ISSUER = 'securevault-api';
const JWT_AUDIENCE = 'securevault-client';
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function signAccessToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function verifyAccessToken(token) {
  // Pinning algorithms explicitly closes off algorithm-confusion attacks
  // (e.g. a token crafted with "alg: none" or a mismatched algorithm).
  // issuer/audience stop a token minted for some other purpose - or a
  // future second app sharing this secret - from being accepted here.
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function hashRefreshToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Issues a new opaque refresh token, stores its hash + expiry on the user
// (replacing whatever was there before - this IS the "rotation": each
// refresh token is single-use, since using it always swaps in a new one).
async function issueRefreshToken(user) {
  const rawToken = crypto.randomBytes(40).toString('hex');
  user.refreshTokenHash = hashRefreshToken(rawToken);
  user.refreshTokenExpires = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await user.save();
  return rawToken;
}

const accessCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 15 * 60 * 1000, // matches ACCESS_TOKEN_TTL
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  // Scoped so the browser only ever sends this cookie to the one route
  // that needs it - it's not attached to every ordinary API call the way
  // the access token cookie is, which shrinks the window an XSS payload
  // (or a leaky log line, proxy, etc.) could ever observe it in transit.
  path: '/refresh',
  maxAge: REFRESH_TOKEN_TTL_MS,
};

// ==================
// AUTH MIDDLEWARE
// ==================

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  try {
    req.userId = verifyAccessToken(token).id;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }
}

// For actions sensitive enough that "has a valid session" shouldn't be
// enough on its own - e.g. an XSS or a shoulder-surfed unlocked laptop
// gets you a valid session, but shouldn't be able to silently turn on/off
// account security settings. Re-checks the account password. Apply this
// to any future route that changes email, password, deletes the account,
// or otherwise needs to know it's really the account owner right now.
async function requireFreshPassword(req, res, next) {
  try {
    const { currentPassword } = req.body;
    if (!currentPassword) {
      return res.status(400).json({ message: 'Current password required for this action.' });
    }
    const user = await User.findById(req.userId);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect password.' });
    }
    req.user = user; // downstream handler can reuse this instead of re-fetching
    next();
  } catch (error) {
    res.status(500).json({ message: 'Could not verify password.' });
  }
}

// ==================
// RATE LIMITING
// ==================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: 'Too many accounts created from this IP. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================
// AUTH ROUTES
// ==================

app.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists!' });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ email, password: hashedPassword });
    await user.save();
    res.json({ message: 'Registration successful! You can log in now.' });
  } catch (error) {
    console.log('Register error:', error.message);
    res.status(500).json({ message: 'Registration failed!' });
  }
});

app.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, twoFactorCode } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const device = req.headers['user-agent'] || 'Unknown';

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found!' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await new AuditLog({ userId: user._id, email, ipAddress, device, status: 'failed', reason: 'Wrong password' }).save();
      return res.status(400).json({ message: 'Wrong password!' });
    }

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
        await new AuditLog({ userId: user._id, email, ipAddress, device, status: 'failed', reason: 'Wrong 2FA code' }).save();
        return res.status(400).json({ message: 'Invalid 2FA code!' });
      }
    }

    const accessToken = signAccessToken(user._id);
    const refreshToken = await issueRefreshToken(user);

    res.cookie('token', accessToken, accessCookieOptions);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    await new AuditLog({ userId: user._id, email, ipAddress, device, status: 'success' }).save();

    res.json({ userId: user._id, email: user.email });
  } catch (error) {
    console.log('Login error:', error.message);
    res.status(500).json({ message: 'Login failed!' });
  }
});

// Exchanges a still-valid refresh token for a new access token AND a new
// refresh token (rotation: the one just used is immediately dead, since
// issueRefreshToken() overwrites the stored hash). A request bearing an
// old, already-rotated-out refresh token fails the hash lookup below and
// is rejected - that's what "rotation" buys you over a single long-lived
// refresh token: a copied-and-replayed old token stops working the moment
// the legitimate client refreshes once.
app.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const rawToken = req.cookies?.refreshToken;
    if (!rawToken) {
      return res.status(401).json({ message: 'No refresh token' });
    }

    const hash = hashRefreshToken(rawToken);
    const user = await User.findOne({
      refreshTokenHash: hash,
      refreshTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      // Either expired, already rotated out, or never existed. Clear
      // whatever's in the browser so it doesn't keep retrying a dead token.
      res.clearCookie('token', accessCookieOptions);
      res.clearCookie('refreshToken', refreshCookieOptions);
      return res.status(401).json({ message: 'Refresh token invalid or expired' });
    }

    const accessToken = signAccessToken(user._id);
    const newRefreshToken = await issueRefreshToken(user);

    res.cookie('token', accessToken, accessCookieOptions);
    res.cookie('refreshToken', newRefreshToken, refreshCookieOptions);

    res.json({ message: 'Refreshed' });
  } catch (error) {
    res.status(500).json({ message: 'Refresh failed' });
  }
});

// Server-side revocation: looks the user up by their refresh token (if
// present) and wipes the stored hash, so that token can never be
// exchanged for a new access token again - not just "removed from this
// browser" like clearing localStorage used to be, but actually dead.
app.post('/logout', async (req, res) => {
  try {
    const rawToken = req.cookies?.refreshToken;
    if (rawToken) {
      const hash = hashRefreshToken(rawToken);
      await User.updateOne(
        { refreshTokenHash: hash },
        { $set: { refreshTokenHash: null, refreshTokenExpires: null } }
      );
    }
  } catch (error) {
    // best-effort - still clear cookies below either way
  }
  res.clearCookie('token', accessCookieOptions);
  res.clearCookie('refreshToken', refreshCookieOptions);
  res.json({ message: 'Logged out' });
});

// ==================
// 2FA ROUTES
// ==================

app.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
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

// Turning on 2FA changes the account's security posture, so this is a
// good example of a "sensitive action": requireFreshPassword makes sure
// whoever's doing this still knows the account password, not just that
// they're carrying a valid (possibly XSS-obtained or left-open) session.
app.post('/2fa/enable', requireAuth, requireFreshPassword, async (req, res) => {
  try {
    const user = req.user;
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

app.post('/vault/setup', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user.vaultSalt) {
      return res.status(400).json({ message: 'Vault already set up!' });
    }
    user.vaultSalt = crypto.randomBytes(16).toString('hex');
    await user.save();
    res.json({ vaultSalt: user.vaultSalt });
  } catch (error) {
    res.status(500).json({ message: 'Vault setup failed!' });
  }
});

app.post('/vault/confirm', requireAuth, async (req, res) => {
  try {
    const { vaultCheck } = req.body;
    const user = await User.findById(req.userId);
    user.vaultCheck = vaultCheck;
    await user.save();
    res.json({ message: 'Vault confirmed!' });
  } catch (error) {
    res.status(500).json({ message: 'Vault confirm failed!' });
  }
});

app.get('/vault/salt', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({ vaultSalt: user.vaultSalt || null, vaultCheck: user.vaultCheck || null });
  } catch (error) {
    res.status(500).json({ message: 'Could not fetch vault salt!' });
  }
});

// ==================
// PASSWORD ROUTES
// ==================

app.get('/passwords', requireAuth, async (req, res) => {
  try {
    const passwords = await Password.find({ userId: req.userId });
    res.json(passwords);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch passwords!' });
  }
});

app.post('/passwords', requireAuth, async (req, res) => {
  try {
    const password = new Password({ ...req.body, userId: req.userId });
    await password.save();
    res.json(password);
  } catch (error) {
    res.status(500).json({ message: 'Failed to save password!' });
  }
});

app.delete('/passwords/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await Password.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!deleted) {
      return res.status(404).json({ message: 'Password not found!' });
    }
    res.json({ message: 'Password deleted!' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete password!' });
  }
});

app.put('/passwords/:id', requireAuth, async (req, res) => {
  try {
    const password = await Password.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { new: true }
    );
    if (!password) {
      return res.status(404).json({ message: 'Password not found!' });
    }
    res.json(password);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update password!' });
  }
});

// ==================
// AUDIT LOG ROUTES
// ==================

app.get('/audit', requireAuth, async (req, res) => {
  try {
    const logs = await AuditLog.find({ userId: req.userId }).sort({ timestamp: -1 }).limit(20);
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