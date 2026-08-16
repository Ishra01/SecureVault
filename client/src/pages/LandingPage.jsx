import { useNavigate } from 'react-router-dom'
import {
  KeyRound, Lock, ShieldCheck, Search, BarChart3, Zap, Dices
} from 'lucide-react'

function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="landing">
      {/* Navbar */}
      <nav className="landing-nav">
        <h2 className="landing-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <KeyRound size={20} /> SecureVault
        </h2>
        <div className="landing-nav-buttons">
          <button className="btn-outline" onClick={() => navigate('/login')}>Login</button>
          <button className="btn-primary" onClick={() => navigate('/signup')}>Get Started Free</button>
        </div>
      </nav>

      {/* Hero */}
      <div className="hero">
        <h1>Your Passwords.</h1>
        <h1 className="hero-highlight">Fort Knox Secure.</h1>
        <p>SecureVault uses AES-256 encryption to protect your passwords. Zero-knowledge architecture means even we can't read your data.</p>
        <div className="hero-buttons">
          <button className="btn-primary" onClick={() => navigate('/signup')}>Start Free Today</button>
          <button className="btn-outline" onClick={() => navigate('/login')}>Login</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats">
        <div className="stat-item">
          <h3>AES-256</h3>
          <p>Military Grade Encryption</p>
        </div>
        <div className="stat-item">
          <h3>Zero-Knowledge</h3>
          <p>We never see your passwords</p>
        </div>
        <div className="stat-item">
          <h3>600M+</h3>
          <p>Breach records checked</p>
        </div>
        <div className="stat-item">
          <h3>2FA</h3>
          <p>Authenticator app support</p>
        </div>
      </div>

      {/* Features */}
      <div className="features">
        <h2>Everything you need to stay secure</h2>
        <div className="features-grid">
          <div className="feature-card">
            <span className="feature-icon"><Lock size={26} strokeWidth={1.75} /></span>
            <h3>AES-256 Encryption</h3>
            <p>Passwords encrypted in your browser before reaching our servers. We never store plaintext.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon"><KeyRound size={26} strokeWidth={1.75} /></span>
            <h3>Two Factor Auth</h3>
            <p>Extra security layer with authenticator-app compatible TOTP codes.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon"><Search size={26} strokeWidth={1.75} /></span>
            <h3>Breach Detection</h3>
            <p>Check if your passwords appear in 600M+ leaked records using HaveIBeenPwned API.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon"><BarChart3 size={26} strokeWidth={1.75} /></span>
            <h3>Login Audit Log</h3>
            <p>Track every login attempt with IP address, device and timestamp.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon"><Zap size={26} strokeWidth={1.75} /></span>
            <h3>Password Strength</h3>
            <p>Real-time password strength checker with detailed feedback.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon"><Dices size={26} strokeWidth={1.75} /></span>
            <h3>Password Generator</h3>
            <p>Generate strong random passwords with one click.</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="cta">
        <h2>Ready to secure your passwords?</h2>
        <p>Join SecureVault today — it's completely free!</p>
        <button className="btn-primary" onClick={() => navigate('/signup')}>
          Get Started Free
        </button>
      </div>

      {/* Footer */}
      <footer className="footer">
        <p>SecureVault — Built with React, Node.js, MongoDB & AES-256</p>
      </footer>
    </div>
  )
}

export default LandingPage