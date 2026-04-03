import React, { useState } from 'react';
import { loginUser } from '../services/api';
import { useNavigate } from 'react-router-dom';
import '../styles.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="auth-card auth-card-single">
        <img className="auth-logo-image" src="/logo-cutout.png" alt="SecureCloud logo" />
        <h1 className="auth-title auth-title-center">SecureCloud</h1>
        <p className="auth-tagline auth-tagline-center">Sign in to your secure workspace.</p>

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
          <div className="auth-input-wrap">
            <input
              className="auth-input auth-input-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              className="password-toggle"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

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
  );
}

export default Login;
