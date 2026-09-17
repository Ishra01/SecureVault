# 🔐 SecureVault

A full-stack password manager with zero-knowledge client-side encryption, 2FA, breach detection, and login audit logging — built with the MERN stack.

**Live demo:** [secure-vault-bice-chi.vercel.app](https://secure-vault-bice-chi.vercel.app)

---

## Features

- **User authentication** — signup/login with bcrypt-hashed passwords; sessions run on short-lived JWT access tokens with rotating refresh tokens, both delivered as httpOnly cookies (see [Security](#security) below)
- **Email verification** — new accounts must verify via a time-limited emailed link before logging in
- **Two-Factor Authentication (2FA)** — TOTP-based 2FA (Google Authenticator-style) with QR code setup via `speakeasy` + `qrcode`; enabling it requires re-confirming your account password
- **Zero-knowledge vault encryption** — the AES key used to encrypt/decrypt your entries is derived in the browser (PBKDF2) from a vault passphrase you set, using a per-user salt. Neither the passphrase nor the derived key is ever sent to the server — it only ever stores ciphertext, a non-secret salt, and an encrypted "canary" value used to verify a passphrase is correct without the server ever being able to check it itself
- **Breach detection** — checks saved passwords against the [HaveIBeenPwned](https://haveibeenpwned.com/API/v3#PwnedPasswords) range API (k-anonymity, only a SHA-1 prefix is sent) to flag compromised passwords
- **Password strength meter** — real-time strength feedback on signup and when adding/editing entries
- **Vault dashboard** — add, edit, delete, search, and reveal/copy saved credentials
- **Audit log** — tracks login attempts (success/failure, IP address, device/user-agent) per user

## Security

This project doubles as a hands-on cybersecurity exercise, so a few choices are worth calling out explicitly rather than leaving implicit:

- **JWT never touches client-side JS.** Both the access token and refresh token are httpOnly cookies — unreadable by `document.cookie`, so an XSS payload (from a compromised dependency, say) can't read and exfiltrate them for reuse elsewhere. This doesn't stop an XSS payload from riding along on requests *while it's actively running* in the page — that's a separate problem, addressed by CSP and input sanitization, not cookie flags.
- **Short-lived access token + rotating refresh token.** The access token expires in 15 minutes. Refreshing it exchanges the current refresh token for a brand-new one every time (true rotation) — a copied, stale refresh token stops working the moment the legitimate session refreshes once.
- **Real logout.** `/logout` deletes the refresh token's hash from the database, not just the cookie in your browser — a session can actually be killed server-side, not merely forgotten client-side.
- **CSRF protection via `SameSite=Strict` + a CORS origin allowlist**, appropriate for a cookie-authenticated JSON API with no server-rendered forms.
- **No IDOR on vault entries.** Every read/update/delete query is scoped to the requesting user's ID at the database level (`findOneAndDelete({ _id, userId })`, not `findByIdAndDelete(id)`) — there's no code path that can act on another user's data.
- **Re-authentication for sensitive actions.** Enabling 2FA requires re-entering your account password, not just holding a valid session.
- **JWTs are verified strictly** — pinned algorithm, issuer, and audience — closing off algorithm-confusion-style attacks.
- **Rate limiting** on login, registration, and token refresh to slow brute-forcing.
- **Security headers via `helmet`**, including HSTS.

Known gaps, left as-is deliberately for now rather than glossed over: no CSP configured on the frontend yet (belongs in the Vercel deployment config, not this API), and refresh-token revocation is single-session (no "log out all devices" / device-family tracking).

## Tech Stack

**Frontend:** React 19, React Router, Axios, crypto-js, Lucide icons, Vite
**Backend:** Node.js, Express 5, MongoDB + Mongoose
**Auth/Security:** JWT (jsonwebtoken), bcryptjs, speakeasy (TOTP 2FA), qrcode, cookie-parser, express-rate-limit, helmet, Nodemailer (email verification)

## Project Structure

```
SecureVault/
├── client/               # React + Vite frontend
│   └── src/
│       ├── pages/        # LandingPage, Login, Signup, VerifyEmail,
│       │                 # Dashboard, Setup2FA, AuditLog
│       ├── components/   # PasswordCard
│       └── api/          # Axios instance (cookie-based auth, silent
│                          # refresh-and-retry on 401)
└── server/                # Express backend
    ├── index.js           # All routes (auth, 2FA, vault, passwords, audit)
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
# 32+ random characters - generate one with:
# node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your_jwt_secret
PORT=5001
# Comma-separate multiple origins (e.g. local dev + deployed frontend)
CLIENT_URL=http://localhost:5173
EMAIL_USER=your_gmail_address
EMAIL_PASS=your_gmail_app_password
# Set to "production" on your host (enables Secure cookies, requires HTTPS)
NODE_ENV=development
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
| `/login` | POST | Login (checks password + 2FA if enabled); sets access + refresh token cookies |
| `/refresh` | POST | Exchanges a valid refresh token cookie for a new access + refresh token pair |
| `/logout` | POST | Revokes the refresh token server-side and clears both cookies |
| `/2fa/setup` | POST | Generate TOTP secret + QR code |
| `/2fa/enable` | POST | Confirm TOTP code + current password, enable 2FA |
| `/vault/setup` | POST | Generate this user's vault salt (first-time vault setup) |
| `/vault/confirm` | POST | Store the encrypted canary used to verify a vault passphrase |
| `/vault/salt` | GET | Fetch this user's vault salt + canary |
| `/passwords` | GET / POST | Fetch / save vault entries |
| `/passwords/:id` | PUT / DELETE | Update / delete a vault entry (ownership-checked) |
| `/audit` | GET | Fetch the user's recent login audit log |

## Roadmap / Ideas
- Content-Security-Policy on the frontend deployment
- "Log out all devices" — track refresh tokens per device/session instead of one per user
- Re-authentication on more sensitive actions (email/password change, account deletion) once those routes exist
- Distributed-attack-resistant rate limiting (current limits are per-IP)
- Password generator with configurable rules
- Shared/team vaults
