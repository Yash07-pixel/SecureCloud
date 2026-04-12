import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFeedback } from '../context/FeedbackContext';
import '../styles.css';

function GoogleAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { notifyError } = useFeedback();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (token) {
      localStorage.setItem('token', token);
      navigate('/dashboard', { replace: true });
      return;
    }

    if (error) {
      notifyError(error);
    } else {
      notifyError('Google sign-in could not be completed.');
    }

    navigate('/login', { replace: true });
  }, [navigate, notifyError, searchParams]);

  return (
    <div className="auth-container">
      <div className="auth-card auth-card-single">
        <h1 className="auth-title auth-title-center">Finishing Google sign-in</h1>
        <p className="auth-tagline auth-tagline-center">Please wait while we connect your SecureCloud account.</p>
      </div>
    </div>
  );
}

export default GoogleAuthCallback;
