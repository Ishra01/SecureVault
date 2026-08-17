# 🔐 SecureVault

A full-stack password manager with client-side AES encryption, 2FA, breach detection, and login audit logging — built with the MERN stack.

**Live demo:** [secure-vault-bice-chi.vercel.app](https://secure-vault-bice-chi.vercel.app)

---

## Features

- **User authentication** — signup/login with bcrypt-hashed passwords and JWT sessions
- **Email verification** — new accounts must verify via a time-limited emailed link before logging in
- **Two-Factor Authentication (2FA)** — TOTP-based 2FA (Google Authenticator-style) with QR code setup via `speakeasy` + `qrcode`
- **Encrypted password storage** — passwords are AES-encrypted (via `crypto-js`) client-side before being sent to the server, so the server only ever stores ciphertext
- **Breach detection** — checks saved passwords against the [HaveIBeenPwned](https://haveibeenpwned.com/API/v3#PwnedPasswords) range API (k-anonymity, only a SHA-1 prefix is sent) to flag compromised passwords
- **Password strength meter** — real-time strength feedback on signup and when adding/editing entries
- **Vault dashboard** — add, edit, delete, search, and reveal/copy saved credentials
- **Audit log** — tracks login attempts (success/failure, IP address, device/user-agent) per user

## Tech Stack

**Frontend:** React 19, React Router, Axios, crypto-js, Lucide icons, Vite
**Backend:** Node.js, Express 5, MongoDB + Mongoose
**Auth/Security:** JWT, bcryptjs, speakeasy (TOTP 2FA), qrcode, Nodemailer (email verification)

## Project Structure

```
SecureVault/
├── client/               # React + Vite frontend
│   └── src/
│       ├── pages/        # LandingPage, Login, Signup, VerifyEmail,
│       │                 # Dashboard, Setup2FA, AuditLog
│       ├── components/   # PasswordCard
│       └── api/          # Axios instance
└── server/                # Express backend
    ├── index.js           # All routes (auth, 2FA, passwords, audit)
    └── models/             # User, Password, AuditLog (Mongoose schemas)
```

## Getting Started

### Prerequisites
- Node.js
- A MongoDB connection string (local or Atlas)
- A Gmail account with an [App Password](https://support.google.com/accounts/answer/185833) for sending verification emails

### 1. Clone the repo
```bash
git clone https://github.com/Ishra01/SecureVault.git
cd SecureVault
```

### 2. Server setup
```bash
cd server
npm install
```

Create a `.env` file in `server/`:
```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=5001
CLIENT_URL=http://localhost:5173
EMAIL_USER=your_gmail_address
EMAIL_PASS=your_gmail_app_password
```

Run the server:
```bash
node index.js
```

### 3. Client setup
```bash
cd ../client
npm install
```

Create a `.env` file in `client/` (or edit the existing one):
```env
VITE_API_URL=http://localhost:5001
```

Run the client:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## API Overview

| Route | Method | Description |
|---|---|---|
| `/register` | POST | Create account, sends verification email |
| `/verify/:token` | GET | Verify email via token |
| `/login` | POST | Login (checks password + 2FA if enabled), returns JWT |
| `/2fa/setup` | POST | Generate TOTP secret + QR code |
| `/2fa/enable` | POST | Confirm TOTP code and enable 2FA |
| `/passwords` | GET / POST | Fetch / save vault entries |
| `/passwords/:id` | PUT / DELETE | Update / delete a vault entry |
| `/audit` | GET | Fetch the user's recent login audit log |

## Roadmap / Ideas
- Derive the encryption key from a user passphrase (e.g. PBKDF2) instead of the user ID, for true zero-knowledge encryption
- Rate limiting on auth routes
- Password generator with configurable rules
- Shared/team vaults
