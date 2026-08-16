import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeft, BarChart3, CheckCircle2, XCircle } from 'lucide-react'

function AuditLog() {
  const [logs, setLogs] = useState([])
  const navigate = useNavigate()
  const token = localStorage.getItem('token')

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    axios.get('http://localhost:5001/audit', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => setLogs(res.data))
      .catch(err => console.log('Error fetching logs'))
  }, [])

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString()
  }

  return (
    <div className="dashboard">
      <nav className="dashboard-nav">
        <h2 className="dashboard-logo">SecureVault</h2>
        <button className="nav-link" onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> Back to Vault
        </button>
      </nav>

      <div className="audit-container">
        <button className="back-btn" onClick={() => navigate('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BarChart3 size={22} /> Login Audit Log
        </h1>
        <p style={{ color: '#6E6E76', marginBottom: '30px' }}>
          Last 20 login attempts to your account
        </p>

        {logs.length === 0 ? (
          <div className="empty-state">
            <h3>No login history yet!</h3>
            <p>Login attempts will appear here</p>
          </div>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Time</th>
                <th>IP Address</th>
                <th>Device</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id}>
                  <td>
                    <span className={log.status === 'success' ? 'audit-success' : 'audit-failed'} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {log.status === 'success' ? (
                        <><CheckCircle2 size={14} /> Success</>
                      ) : (
                        <><XCircle size={14} /> Failed</>
                      )}
                    </span>
                  </td>
                  <td>{formatDate(log.timestamp)}</td>
                  <td>{log.ipAddress}</td>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.device}
                  </td>
                  <td>{log.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default AuditLog