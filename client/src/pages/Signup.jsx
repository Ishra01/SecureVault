import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import axios from 'axios'
import { ShieldCheck, Eye, EyeOff } from 'lucide-react'

function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const getPasswordStrength = (pass) => {
    if (pass.length < 6) return { label: 'Weak', color: '#F16565', width: '30%' }
    if (pass.length < 10) return { label: 'Medium', color: '#E5A93D', width: '60%' }
    if (/[A-Z]/.test(pass) && /[0-9]/.test(pass) && /[^A-Za-z0-9]/.test(pass)) {
      return { label: 'Strong', color: '#3DD9B4', width: '100%' }
    }
    return { label: 'Medium', color: '#E5A93D', width: '60%' }
  }

  const strength = getPasswordStrength(password)

  const handleSignup = async () => {
    if (!email || !password || !confirmPassword) {
      setMessage('Please fill all fields!')
      return
    }
    if (!email.includes('@') || !email.includes('.')) {
      setMessage('Please enter a valid email!')
      return
    }
    if (password.length < 8) {
      setMessage('Password must be at least 8 characters!')
      return
    }
    if (password !== confirmPassword) {
      setMessage('Passwords do not match!')
      return
    }

    setLoading(true)
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/register`, { email, password })
      setMessage(res.data.message)
      setSuccess(true)
    } catch (err) {
      setMessage(err.response?.data?.message || 'Registration failed!')
    }
    setLoading(false)
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-logo">
          <ShieldCheck size={36} color="#FF6B35" strokeWidth={1.75} />
        </div>
        <h2>Create Account</h2>
        <p className="auth-subtitle">Join SecureVault today</p>

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
            placeholder="Master password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
          />
          <span className="eye-toggle" onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </span>
        </div>

        {password && (
          <div className="strength-bar">
            <div className="strength-fill" style={{ width: strength.width, backgroundColor: strength.color }}></div>
            <span style={{ color: strength.color }}>{strength.label}</span>
          </div>
        )}

        <div className="password-wrapper">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Confirm master password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="auth-input"
          />
        </div>

        <button
          className="auth-btn"
          onClick={handleSignup}
          disabled={loading}
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        {message && (
          <p className={success ? 'message-success' : 'message-error'}>
            {message}
          </p>
        )}

        <p className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  )
}

export default Signup