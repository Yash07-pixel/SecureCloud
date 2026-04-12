import React, { useState } from 'react';
import { API_BASE_URL, loginUser } from '../services/api';
import { useNavigate } from 'react-router-dom';
import '../styles.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const googleSignInEnabled = Boolean(process.env.REACT_APP_GOOGLE_CLIENT_ID);
  const navigate = useNavigate();

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/google/login`;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoggingIn(true);

    const wakeUpTimer = window.setTimeout(() => {
      setInfo('Server is waking up. This can take up to a minute on Render free tier.');
    }, 2500);

    try {
      const res = await loginUser({ email, password });
      setInfo('');
      localStorage.setItem('token', res.data.access_token);
      navigate('/dashboard');
    } catch (err) {
      setInfo('');
      const status = err?.response?.status;
      if (!status) {
        setError('The server may still be waking up. Please wait a moment and try again.');
      } else {
        setError('Invalid email or password');
      }
    } finally {
      window.clearTimeout(wakeUpTimer);
      setInfo('');
      setLoggingIn(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card auth-card-single">
        <div className="auth-logo-spacer" aria-hidden="true" />
        <h1 className="auth-title auth-title-center">SecureCloud</h1>
        <p className="auth-tagline auth-tagline-center">Sign in to your secure workspace.</p>

        {error && <p className="auth-error">{error}</p>}
        {info && <p className="auth-info">{info}</p>}

        <form className="auth-form" onSubmit={handleLogin}>
          <label className="auth-label">Email</label>
          <input
            className="auth-input"
            type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loggingIn}
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
              disabled={loggingIn}
              required
            />
            <button
              className="password-toggle"
              type="button"
              disabled={loggingIn}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <button className="auth-button" type="submit" disabled={loggingIn}>
            {loggingIn ? 'Connecting...' : 'Login'}
          </button>
        </form>

        {googleSignInEnabled && (
          <>
            <div className="auth-divider">
              <span>or</span>
            </div>
            <button className="auth-google-button" type="button" disabled={loggingIn} onClick={handleGoogleLogin}>
              Continue with Google
            </button>
          </>
        )}

        <p className="auth-bottom">
          Don&apos;t have an account?{' '}
          <span className={`auth-link ${loggingIn ? 'auth-link-disabled' : ''}`} onClick={() => !loggingIn && navigate('/register')}>
            Register here
          </span>
        </p>
      </div>
    </div>
  );
}

export default Login;
