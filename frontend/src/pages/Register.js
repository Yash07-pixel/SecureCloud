import React, { useState } from 'react';
import { registerUser } from '../services/api';
import { useNavigate } from 'react-router-dom';
import '../styles.css';

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [info, setInfo] = useState('');
  const [registering, setRegistering] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setInfo('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name cannot be empty');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setRegistering(true);
    const wakeUpTimer = window.setTimeout(() => {
      setInfo('Server is waking up. Creating your account may take a little longer.');
    }, 2500);

    try {
      await registerUser({ name: trimmedName, email, password });
      setSuccess('Account created. Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      const status = err?.response?.status;
      if (!status) {
        setError('The server may still be waking up. Please wait a moment and try again.');
      } else {
        setError(err.response?.data?.detail || 'Email already registered or something went wrong');
      }
    } finally {
      window.clearTimeout(wakeUpTimer);
      setRegistering(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card auth-card-single">
        <div className="auth-logo-spacer" aria-hidden="true" />
        <h1 className="auth-title auth-title-center">SecureCloud</h1>
        <p className="auth-tagline auth-tagline-center">Create your account and start protecting your files.</p>

        {error && <p className="auth-error">{error}</p>}
        {success && <p className="auth-success">{success}</p>}
        {info && <p className="auth-info">{info}</p>}

        <form className="auth-form" onSubmit={handleRegister}>
          <label className="auth-label">Full Name</label>
          <input
            className="auth-input"
            type="text"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={registering}
            required
          />

          <label className="auth-label">Email</label>
          <input
            className="auth-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={registering}
            required
          />

          <label className="auth-label">Password</label>
          <div className="auth-input-wrap">
            <input
              className="auth-input auth-input-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={registering}
              minLength={8}
              required
            />
            <button
              className="password-toggle"
              type="button"
              disabled={registering}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <div className="auth-helper">Use at least 8 characters to keep your account secure.</div>

          <button className="auth-button" type="submit" disabled={registering}>
            {registering ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="auth-bottom">
          Already have an account?{' '}
          <span className={`auth-link ${registering ? 'auth-link-disabled' : ''}`} onClick={() => !registering && navigate('/login')}>
            Login here
          </span>
        </p>
      </div>
    </div>
  );
}

export default Register;
