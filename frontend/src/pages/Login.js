import React, { useState } from 'react';
import { loginUser } from '../services/api';
import { useNavigate } from 'react-router-dom';
import '../styles.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await loginUser({ email, password });
      localStorage.setItem('token', res.data.access_token);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-shell">
        <div className="auth-panel auth-panel-brand">
          <div className="auth-brand-mark" aria-hidden="true">
            <span className="auth-brand-core">SC</span>
          </div>
          <div className="auth-eyebrow">Encrypted Workspace</div>
          <h1 className="auth-title">SecureCloud</h1>
          <p className="auth-tagline">Your files. Safe. Always.</p>
          <div className="auth-feature-list">
            <div className="auth-feature-item">AES-256 encryption for every upload</div>
            <div className="auth-feature-item">Timed sharing with controlled access</div>
            <div className="auth-feature-item">Integrity checks on every download</div>
          </div>
        </div>

        <div className="auth-panel auth-card auth-panel-form">
          <div className="auth-form-header">
            <div className="auth-form-kicker">Welcome back</div>
            <h2 className="auth-form-title">Sign in to your vault</h2>
            <p className="auth-form-copy">Access your encrypted files, shares, and recovery tools in one place.</p>
          </div>

          {error && <p className="auth-error">{error}</p>}

          <form className="auth-form" onSubmit={handleLogin}>
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label className="auth-label">Password</label>
            <input
              className="auth-input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button className="auth-button" type="submit">
              Login
            </button>
          </form>

          <p className="auth-bottom">
            Don&apos;t have an account?{' '}
            <span className="auth-link" onClick={() => navigate('/register')}>
              Register here
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
