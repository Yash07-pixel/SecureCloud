import React, { useState } from 'react';
import { registerUser } from '../services/api';
import { useNavigate } from 'react-router-dom';
import '../styles.css';

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name cannot be empty');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    try {
      await registerUser({ name: trimmedName, email, password });
      setSuccess('Account created. Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Email already registered or something went wrong');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-shell">
        <div className="auth-panel auth-panel-brand">
          <div className="auth-brand-mark" aria-hidden="true">
            <span className="auth-brand-core">SC</span>
          </div>
          <div className="auth-eyebrow">Private Cloud Vault</div>
          <h1 className="auth-title">SecureCloud</h1>
          <p className="auth-tagline">Create your encrypted workspace in minutes.</p>
          <div className="auth-feature-list">
            <div className="auth-feature-item">Private uploads with encrypted storage</div>
            <div className="auth-feature-item">Secure sharing with expiry controls</div>
            <div className="auth-feature-item">Star, restore, and manage files with ease</div>
          </div>
        </div>

        <div className="auth-panel auth-card auth-panel-form">
          <div className="auth-form-header">
            <div className="auth-form-kicker">Create account</div>
            <h2 className="auth-form-title">Set up your vault</h2>
            <p className="auth-form-copy">Start storing and sharing files with protection built in from the first upload.</p>
          </div>

          {error && <p className="auth-error">{error}</p>}
          {success && <p className="auth-success">{success}</p>}

          <form className="auth-form" onSubmit={handleRegister}>
            <label className="auth-label">Full Name</label>
            <input
              className="auth-input"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

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
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />

            <div className="auth-helper">Use at least 8 characters to keep your account secure.</div>

            <button className="auth-button" type="submit">
              Create Account
            </button>
          </form>

          <p className="auth-bottom">
            Already have an account?{' '}
            <span className="auth-link" onClick={() => navigate('/login')}>
              Login here
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;
