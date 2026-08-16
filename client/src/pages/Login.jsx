import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [requires2FA, setRequires2FA] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async () => {
    if (!email || !password) {
      setMessage('Please fill all fields!')
      return
    }

    setLoading(true)
    try {
      const res = await axios.post('http://localhost:5001/login', {
        email,
        password,
        twoFactorCode: requires2FA ? twoFactorCode : undefined,
      })

      localStorage.setItem('token', res.data.token)
      localStorage.setItem('userId', res.data.userId)
      localStorage.setItem('userEmail', res.data.email)
      navigate('/dashboard')
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Login failed!'
      const needs2FA = err.response?.data?.requires2FA

      if (needs2FA) {
        setRequires2FA(true)
        setMessage('Enter your 2FA code from your authenticator app')
      } else {
        setMessage(errorMsg)
      }
    }
    setLoading(false)
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-logo">
          <Lock size={36} color="#FF6B35" strokeWidth={1.75} />
        </div>
        <h2>Welcome Back</h2>
        <p className="auth-subtitle">Log in to your SecureVault</p>

        {!requires2FA ? (
          <>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
            />
            <div className="password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Master password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
              />
              <span className="eye-toggle" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </span>
            </div>
          </>
        ) : (
          <div className="twofa-container">
            <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <KeyRound size={16} /> Enter the 6-digit code from your authenticator app
            </p>
            <input
              type="text"
              placeholder="000000"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              className="auth-input twofa-input"
              maxLength={6}
            />
          </div>
        )}

        <button
          className="auth-btn"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? 'Logging in...' : requires2FA ? 'Verify Code' : 'Sign In'}
        </button>

        {message && (
          <p className="message-error">{message}</p>
        )}

        {!requires2FA && (
          <p className="auth-switch">
            Don't have an account? <Link to="/signup">Sign Up</Link>
          </p>
        )}
      </div>
    </div>
  )
}

export default Login