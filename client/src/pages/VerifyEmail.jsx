import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

function VerifyEmail() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState('Verifying your email...')
  const [success, setSuccess] = useState(false)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

       axios.get(`${import.meta.env.VITE_API_URL}/verify/${token}`)
      .then(res => {
        setMessage(res.data.message)
        setSuccess(true)
        setTimeout(() => navigate('/login'), 3000)
      })
      .catch(err => {
        setMessage(err.response?.data?.message || 'Verification failed!')
        setSuccess(false)
      })
  }, [token])

  return (
    <div className="verify-container">
      <div className="verify-box">
        <span className="verify-icon">{success ? '✅' : '❌'}</span>
        <h2>{message}</h2>
        {success && <p>Redirecting to login in 3 seconds...</p>}
      </div>
    </div>
  )
}

export default VerifyEmail