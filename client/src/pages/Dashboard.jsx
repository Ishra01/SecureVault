import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import CryptoJS from 'crypto-js'
import {
  KeyRound, Search, Plus, LogOut, BarChart3, Globe, User,
  Eye, EyeOff, ShieldCheck, ShieldAlert, Copy, Check, Trash2, Dices, Pencil
} from 'lucide-react'

function Dashboard() {
  const [passwords, setPasswords] = useState([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [website, setWebsite] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedField, setCopiedField] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const navigate = useNavigate()

  const token = localStorage.getItem('token')
  const userEmail = localStorage.getItem('userEmail')
  const userId = localStorage.getItem('userId')

  // ---- Zero-knowledge vault key ----
  // The AES key is derived in the browser from a passphrase only the user
  // knows, via PBKDF2 + a per-user salt. Neither the passphrase nor the
  // derived key is ever sent to the server - the server only ever stores
  // ciphertext, a (non-secret) salt, and an encrypted "canary" value used
  // to verify a key is correct WITHOUT ever trusting an unverified key.
  const VAULT_CANARY = 'vault-check-ok'

  const [vaultKey, setVaultKey] = useState(null)
  const [vaultUnlocked, setVaultUnlocked] = useState(false)
  const [vaultSalt, setVaultSalt] = useState(null)
  const [vaultCheck, setVaultCheck] = useState(null)
  const [vaultMode, setVaultMode] = useState(null) // 'setup' | 'unlock' | null | 'loading'
  const [passphraseInput, setPassphraseInput] = useState('')
  const [passphraseConfirm, setPassphraseConfirm] = useState('')
  const [vaultError, setVaultError] = useState('')

  const deriveKey = (passphrase, salt) => {
    return CryptoJS.PBKDF2(passphrase, salt, {
      keySize: 256 / 32,
      iterations: 100000,
    }).toString()
  }

  // Returns true only if `key` correctly decrypts the stored canary back
  // to the exact known string. This is the ONLY thing allowed to grant
  // access to the dashboard - a key existing in sessionStorage is never
  // enough on its own.
  const verifyKey = (key, encryptedCanary) => {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedCanary, key)
      return bytes.toString(CryptoJS.enc.Utf8) === VAULT_CANARY
    } catch {
      return false
    }
  }

  const fetchPasswords = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/passwords`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setPasswords(res.data)
    } catch (err) {
      console.log('Error fetching passwords')
    }
  }

  useEffect(() => {
    if (!token) {
      navigate('/login')
      return
    }
    fetchPasswords()
    setVaultMode('loading')

    axios.get(`${import.meta.env.VITE_API_URL}/vault/salt`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      const { vaultSalt: salt, vaultCheck: check } = res.data
      setVaultSalt(salt)
      setVaultCheck(check)

      if (!salt) {
        setVaultMode('setup')
        return
      }

      // A key may be sitting in sessionStorage from earlier this tab
      // session - but it's only trusted if it actually decrypts the
      // canary correctly. Otherwise we throw it away and re-prompt.
      const storedKey = sessionStorage.getItem('vaultKey')
      if (storedKey && verifyKey(storedKey, check)) {
        setVaultKey(storedKey)
        setVaultUnlocked(true)
        setVaultMode(null)
      } else {
        sessionStorage.removeItem('vaultKey')
        setVaultMode('unlock')
      }
    }).catch(() => console.log('Could not check vault status'))
  }, [])

  const handleVaultSetup = async (e) => {
    e.preventDefault()
    setVaultError('')
    if (passphraseInput.length < 8) {
      setVaultError('Passphrase must be at least 8 characters.')
      return
    }
    if (passphraseInput !== passphraseConfirm) {
      setVaultError('Passphrases do not match.')
      return
    }
    try {
      const setupRes = await axios.post(`${import.meta.env.VITE_API_URL}/vault/setup`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const key = deriveKey(passphraseInput, setupRes.data.vaultSalt)
      const encryptedCanary = CryptoJS.AES.encrypt(VAULT_CANARY, key).toString()

      await axios.post(`${import.meta.env.VITE_API_URL}/vault/confirm`,
        { vaultCheck: encryptedCanary },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      sessionStorage.setItem('vaultKey', key)
      setVaultKey(key)
      setVaultUnlocked(true)
      setVaultMode(null)
      setPassphraseInput('')
      setPassphraseConfirm('')
    } catch (err) {
      setVaultError('Vault setup failed. Try again.')
    }
  }

  const handleVaultUnlock = (e) => {
    e.preventDefault()
    setVaultError('')
    const key = deriveKey(passphraseInput, vaultSalt)

    if (!verifyKey(key, vaultCheck)) {
      setVaultError('Incorrect vault passphrase.')
      return
    }

    sessionStorage.setItem('vaultKey', key)
    setVaultKey(key)
    setVaultUnlocked(true)
    setVaultMode(null)
    setPassphraseInput('')
  }

  const encryptPassword = (pass) => {
    return CryptoJS.AES.encrypt(pass, vaultKey).toString()
  }

  const decryptPassword = (encryptedPass) => {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedPass, vaultKey)
      const result = bytes.toString(CryptoJS.enc.Utf8)
      return result || '(wrong passphrase)'
    } catch {
      return '(wrong passphrase)'
    }
  }

  const checkBreach = async (pass) => {
    try {
      const hash = CryptoJS.SHA1(pass).toString().toUpperCase()
      const prefix = hash.slice(0, 5)
      const suffix = hash.slice(5)
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`)
      const text = await res.text()
      const lines = text.split('\n')
      return lines.some(line => line.split(':')[0] === suffix)
    } catch (err) {
      console.log('Breach check failed:', err.message)
      return false
    }
  }

  const getStrength = (pass) => {
    if (pass.length < 6) return 'Weak'
    if (pass.length < 10) return 'Medium'
    if (/[A-Z]/.test(pass) && /[0-9]/.test(pass) && /[^A-Za-z0-9]/.test(pass)) return 'Strong'
    return 'Medium'
  }

  const getFaviconUrl = (site) => {
    if (!site) return null
    let domain = site.trim().toLowerCase()
    domain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
    if (!domain.includes('.')) domain += '.com'
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  }

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    let result = ''
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setPassword(result)
  }

  const handleSave = async () => {
    if (!website || !username || !password) {
      setMessage('Please fill all fields!')
      return
    }

    setLoading(true)
    try {
      const encryptedPassword = encryptPassword(password)
      const strength = getStrength(password)
      const isBreached = await checkBreach(password)

      if (editingId) {
        await axios.put(`${import.meta.env.VITE_API_URL}/passwords/${editingId}`, {
          website,
          username,
          encryptedPassword,
          strength,
          isBreached,
        }, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setMessage('Password updated!')
      } else {
        await axios.post(`${import.meta.env.VITE_API_URL}/passwords`, {
          website,
          username,
          encryptedPassword,
          strength,
          isBreached,
        }, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setMessage('Password saved!')
      }

      setWebsite('')
      setUsername('')
      setPassword('')
      setShowForm(false)
      setEditingId(null)
      fetchPasswords()
    } catch (err) {
      setMessage(editingId ? 'Failed to update password!' : 'Failed to save password!')
    }
    setLoading(false)
  }

  const handleEditClick = () => {
    if (!selected) return
    setWebsite(selected.website)
    setUsername(selected.username)
    setPassword(decryptPassword(selected.encryptedPassword))
    setEditingId(selected._id)
    setShowForm(true)
  }

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL}/passwords/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (selectedId === id) setSelectedId(null)
      fetchPasswords()
    } catch (err) {
      console.log('Delete failed')
    }
  }

  const toggleShowPassword = (id) => {
    setShowPassword(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userId')
    localStorage.removeItem('userEmail')
    sessionStorage.removeItem('vaultKey')
    navigate('/login')
  }

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1500)
  }

  const filtered = passwords.filter(p =>
    p.website.toLowerCase().includes(search.toLowerCase()) ||
    p.username.toLowerCase().includes(search.toLowerCase())
  )

  const selected = passwords.find(p => p._id === selectedId)

  if (vaultMode === 'loading') {
    return (
      <div className="dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p>Checking vault status...</p>
      </div>
    )
  }

  if (vaultMode) {
    return (
      <div className="dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <form
          onSubmit={vaultMode === 'setup' ? handleVaultSetup : handleVaultUnlock}
          style={{ maxWidth: 380, width: '100%', padding: 24, border: '1px solid #333', borderRadius: 12 }}
        >
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={20} />
            {vaultMode === 'setup' ? 'Set Your Vault Passphrase' : 'Unlock Your Vault'}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 16 }}>
            {vaultMode === 'setup'
              ? "This is separate from your login password and never leaves your browser. It's used to encrypt your vault - we can't recover it if you forget it, so store it somewhere safe."
              : 'Enter your vault passphrase to decrypt your saved passwords.'}
          </p>
          <input
            type="password"
            placeholder="Vault passphrase"
            value={passphraseInput}
            onChange={(e) => setPassphraseInput(e.target.value)}
            style={{ width: '100%', marginBottom: 10 }}
            autoFocus
          />
          {vaultMode === 'setup' && (
            <input
              type="password"
              placeholder="Confirm passphrase"
              value={passphraseConfirm}
              onChange={(e) => setPassphraseConfirm(e.target.value)}
              style={{ width: '100%', marginBottom: 10 }}
            />
          )}
          {vaultError && <p style={{ color: '#e74c3c', fontSize: 13 }}>{vaultError}</p>}
          <button type="submit" style={{ width: '100%' }}>
            {vaultMode === 'setup' ? 'Create Vault' : 'Unlock'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <nav className="dashboard-nav">
        <h2 className="dashboard-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <KeyRound size={20} /> SecureVault
        </h2>
        <div className="dashboard-nav-right">
          <button className="nav-link" onClick={() => navigate('/audit')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <BarChart3 size={16} /> Audit Log
          </button>
          <div className="profile-avatar">
            {userEmail?.[0]?.toUpperCase() || 'U'}
          </div>
          <button className="nav-link" onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <div className="vault-toolbar">
        <button onClick={() => { setEditingId(null); setWebsite(''); setUsername(''); setPassword(''); setShowForm(true) }}>
          <Plus size={15} /> New
        </button>
        <button
          disabled={!selected}
          onClick={() => selected && copyToClipboard(decryptPassword(selected.encryptedPassword), 'toolbar')}
        >
          {copiedField === 'toolbar' ? <Check size={15} /> : <Copy size={15} />} Copy Password
        </button>
        <button disabled={!selected} onClick={handleEditClick}>
          <Pencil size={15} /> Edit
        </button>
        <button disabled={!selected} onClick={() => selected && handleDelete(selected._id)}>
          <Trash2 size={15} /> Delete
        </button>
      </div>

      <div className="vault-layout">
        <div className="vault-sidebar">
          <div className="vault-search">
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6E6E76' }} />
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '30px' }}
              />
            </div>
          </div>
          <div className="vault-list">
            {filtered.length === 0 ? (
              <div style={{ padding: '20px', color: '#A0A0A8', fontSize: '13px', textAlign: 'center' }}>
                No passwords yet
              </div>
            ) : (
              filtered.map((p) => (
                <div
                  key={p._id}
                  className={`vault-list-item ${selectedId === p._id ? 'active' : ''}`}
                  onClick={() => setSelectedId(p._id)}
                >
                  <span className="vault-list-icon">
                    <img
                      src={getFaviconUrl(p.website)}
                      alt=""
                      style={{ width: '16px', height: '16px', objectFit: 'contain' }}
                      onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                    />
                    <Globe size={14} style={{ display: 'none' }} />
                  </span>
                  {p.website}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="vault-detail">
          {!selected ? (
            <div className="vault-detail-empty">Select a password to view details</div>
          ) : (
            <>
              <div className="vault-detail-title">
                <span className="vault-list-icon" style={{ width: '36px', height: '36px' }}>
                  <img
                    src={getFaviconUrl(selected.website)}
                    alt=""
                    style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                  />
                  <Globe size={18} style={{ display: 'none' }} />
                </span>
                <h2>{selected.website}</h2>
              </div>

              <div className="vault-field">
                <label>Username</label>
                <div className="vault-field-row">
                  <User size={15} color="#6E6E76" />
                  <span className="value">{selected.username}</span>
                  <button className="icon-btn" onClick={() => copyToClipboard(selected.username, 'username')}>
                    {copiedField === 'username' ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              </div>

              <div className="vault-field">
                <label>Password</label>
                <div className="vault-field-row mono">
                  <span className="value">
                    {showPassword[selected._id] ? decryptPassword(selected.encryptedPassword) : '••••••••••••'}
                  </span>
                  <button className="icon-btn" onClick={() => toggleShowPassword(selected._id)}>
                    {showPassword[selected._id] ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button className="icon-btn" onClick={() => copyToClipboard(decryptPassword(selected.encryptedPassword), 'password')}>
                    {copiedField === 'password' ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              </div>

              <div className="vault-field">
                <label>Strength & Breach Status</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span className={`strength-badge strength-${selected.strength?.toLowerCase()}`}>
                    {selected.strength}
                  </span>
                  <span className={`breach-badge ${selected.isBreached ? 'breach-danger' : 'breach-safe'}`} style={{ marginBottom: 0 }}>
                    {selected.isBreached ? (
                      <><ShieldAlert size={13} /> Breached</>
                    ) : (
                      <><ShieldCheck size={13} /> No breach detected</>
                    )}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showForm && (
        <div className="add-form-overlay">
          <div className="add-form-box">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <KeyRound size={20} /> {editingId ? 'Edit Password' : 'Add New Password'}
            </h2>

            <input
              type="text"
              placeholder="Website (e.g. Google)"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="form-input"
            />

            <input
              type="text"
              placeholder="Username or Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="form-input"
            />

            <div className="password-wrapper">
              <input
                type={showPassword.new ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ paddingRight: '45px' }}
              />
              <span
                className="eye-toggle"
                onClick={() => setShowPassword(prev => ({ ...prev, new: !prev.new }))}
              >
                {showPassword.new ? <EyeOff size={18} /> : <Eye size={18} />}
              </span>
            </div>

            {password && (
              <div className="strength-bar">
                <div
                  className="strength-fill"
                  style={{
                    width: getStrength(password) === 'Weak' ? '30%' : getStrength(password) === 'Medium' ? '60%' : '100%',
                    backgroundColor: getStrength(password) === 'Weak' ? '#F16565' : getStrength(password) === 'Medium' ? '#E5A93D' : '#3DD9B4'
                  }}
                ></div>
                <span style={{
                  color: getStrength(password) === 'Weak' ? '#F16565' : getStrength(password) === 'Medium' ? '#E5A93D' : '#3DD9B4'
                }}>
                  {getStrength(password)}
                </span>
              </div>
            )}

            <button className="generate-btn" onClick={generatePassword} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <Dices size={16} /> Generate Strong Password
            </button>

            {message && <p className="message-error">{message}</p>}

            <div className="form-buttons">
              <button className="btn-save" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : editingId ? 'Update Password' : 'Save Password'}
              </button>
              <button className="btn-cancel" onClick={() => {
                setShowForm(false)
                setMessage('')
                setEditingId(null)
                setWebsite('')
                setUsername('')
                setPassword('')
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard