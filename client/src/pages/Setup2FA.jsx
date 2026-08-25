import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { KeyRound } from 'lucide-react'

function Setup2FA() {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const hasRun = useRef(false)

  const [qrCode, setQrCode] = useState(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [alreadyEnabled, setAlreadyEnabled] = useState(false)

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    if (hasRun.current) return
    hasRun.current = true

    axios.post(`${import.meta.env.VITE_API_URL}/2fa/setup`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        setQrCode(res.data.qrCode)
      })
      .catch(err => {
        const msg = err.response?.data?.message || 'Failed to load QR code'
        setMessage(msg)
        if (err.response?.status === 400) {
          setAlreadyEnabled(true)
        }
      })
  }, [])

  const handleEnable = () => {
    axios.post(`${import.meta.env.VITE_API_URL}/2fa/enable`,
      { code },
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then(res => {
        setMessage(res.data.message)
        setEnabled(true)
      })
      .catch(err => {
        setMessage(err.response?.data?.message || 'Invalid code, try again')
      })
  }

  return (
    <div className="verify-container">
      <div className="verify-box">
        <div style={{ marginBottom: '10px' }}>
          <KeyRound size={36} color="#FF6B35" strokeWidth={1.75} />
        </div>
        <h2>Set Up Two-Factor Authentication</h2>

        {!enabled && !alreadyEnabled && (
          <>
            <p>1. Scan this QR code with your authenticator app</p>
            {qrCode && <img src={qrCode} alt="2FA QR Code" style={{ margin: '20px auto', display: 'block' }} />}

            <p>2. Enter the 6-digit code it shows you</p>
            <input
              className="auth-input twofa-input"
              type="text"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
            />
            <button className="auth-btn" style={{ marginTop: '15px' }} onClick={handleEnable}>
              Enable 2FA
            </button>
          </>
        )}

        {message && (
          <p className={enabled ? 'message-success' : 'message-error'} style={{ marginTop: '15px' }}>
            {message}
          </p>
        )}

        {(enabled || alreadyEnabled) && (
          <button className="auth-btn" style={{ marginTop: '15px' }} onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        )}
      </div>
    </div>
  )
}

export default Setup2FA