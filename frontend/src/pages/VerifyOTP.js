import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import "../styles.css";

const API = axios.create({ baseURL: "http://localhost:8000" });

export default function VerifyOTP() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || "";

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  const handleVerify = async () => {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await API.post(`/auth/verify-otp?email=${email}&otp=${otp}`);
      setSuccess(res.data.message);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendMsg("");
    try {
      const res = await API.post(`/auth/resend-otp?email=${email}`);
      setResendMsg(res.data.message);
    } catch (err) {
      setResendMsg("Failed to resend OTP. Try again.");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">📧</div>
        <h2 className="auth-title">Verify your Email</h2>
        <p className="auth-tagline">
          We sent a 6-digit OTP to <strong>{email}</strong>.<br />
          It expires in 10 minutes.
        </p>

        {error && <p className="auth-error">{error}</p>}
        {success && <p className="auth-success">{success}</p>}

        <label className="auth-label">Enter OTP</label>
        <input
          className="auth-input"
          type="text"
          maxLength={6}
          placeholder="e.g. 483921"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          style={{ letterSpacing: "8px", fontSize: "22px", textAlign: "center" }}
        />

        <button className="auth-button" onClick={handleVerify} disabled={loading}>
          {loading ? "Verifying..." : "Verify OTP"}
        </button>

        <p className="auth-bottom">
          Didn't get the email?{" "}
          <span className="auth-link" onClick={handleResend}>
            Resend OTP
          </span>
        </p>

        {resendMsg && <p className="auth-success">{resendMsg}</p>}
      </div>
    </div>
  );
}