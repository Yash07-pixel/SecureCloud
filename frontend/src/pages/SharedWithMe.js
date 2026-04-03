import React, { useState, useEffect } from 'react';
import { getSharedFiles, downloadFile, removeSharedFile } from '../services/api';
import '../styles.css';
import { useNavigate, useLocation } from 'react-router-dom';
import { useFeedback } from '../context/FeedbackContext';

function SharedWithMe() {
  const [files, setFiles] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { notifySuccess, notifyError, confirm, getErrorMessage } = useFeedback();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      JSON.parse(atob(token.split('.')[1]));
    } catch (err) {
      localStorage.removeItem('token');
      navigate('/login');
      return;
    }
    fetchSharedFiles();

    const interval = setInterval(() => {
      fetchSharedFiles();
    }, 3600000);

    return () => clearInterval(interval);
  }, []);

  const fetchSharedFiles = async () => {
    try {
      const res = await getSharedFiles();
      setFiles(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownload = async (fileId, filename) => {
    try {
      const res = await downloadFile(fileId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      notifyError(getErrorMessage(err, 'Download failed or access has expired'));
    }
  };

  const handleRemove = async (fileId) => {
    const confirmed = await confirm({
      title: 'Remove Shared File?',
      message: 'This will remove the file from your shared list.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await removeSharedFile(fileId);
      notifySuccess('File removed from your shared list');
      fetchSharedFiles();
    } catch (err) {
      notifyError(getErrorMessage(err, 'Failed to remove file'));
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatExpiry = (expiry, hoursRemaining) => {
    if (!expiry) return 'Never expires';
    if (hoursRemaining === 0) return 'Access expired';
    if (hoursRemaining < 24) return `${hoursRemaining}h remaining`;
    const days = Math.floor(hoursRemaining / 24);
    const hours = hoursRemaining % 24;
    return `${days}d ${hours}h remaining`;
  };

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-kicker">Encrypted Workspace</span>
          <span>SecureCloud</span>
        </div>
        <div className="sidebar-nav">
          <div className="nav-item" onClick={() => navigate('/dashboard')}>
            <span className="nav-icon">MY</span> My Files
          </div>
          <div className={location.pathname === '/shared' ? 'nav-item-active' : 'nav-item'} onClick={() => navigate('/shared')}>
            <span className="nav-icon">SH</span> Shared with Me
          </div>
          <div className={location.pathname === '/starred' ? 'nav-item-active' : 'nav-item'} onClick={() => navigate('/starred')}>
            <span className="nav-icon">ST</span> Starred
          </div>
          <div className={location.pathname === '/trash' ? 'nav-item-active' : 'nav-item'} onClick={() => navigate('/trash')}>
            <span className="nav-icon">TR</span> Trash
          </div>
        </div>
        <div className="sidebar-footer">
          <div
            className="nav-item"
            onClick={() => {
              localStorage.removeItem('token');
              navigate('/login');
            }}
          >
            <span className="nav-icon">EX</span> Logout
          </div>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <div>
            <div className="greeting">Shared with Me</div>
            <div className="greeting-sub">Review files others have granted you access to and keep track of expiry windows.</div>
          </div>
        </div>

        <div className="content">
          <div className="security-banner">
            You can only <strong>&nbsp;download&nbsp;</strong> files shared with you. Sharing is restricted to file owners only.
          </div>

          <div className="section-heading">
            <h3 className="section-title">Files Shared with You</h3>
            <span className="section-chip">{files.length} items</span>
          </div>

          {files.length === 0 ? (
            <div className="empty empty-state">
              <p>No files shared with you yet.</p>
            </div>
          ) : (
            <div className="table-card">
              <table className="file-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Shared By</th>
                    <th>Encryption</th>
                    <th>Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => (
                    <tr key={file.id}>
                      <td><span className="file-name-link static-file-name">{file.original_name}</span></td>
                      <td>{formatSize(file.size)}</td>
                      <td>{file.owner_email}</td>
                      <td>
                        <span className="badge-encrypted">AES-256</span>
                      </td>
                      <td>
                        <span className={file.expiry ? 'status-pill status-pill-danger' : 'status-pill status-pill-success'}>
                          {formatExpiry(file.expiry, file.hours_remaining)}
                        </span>
                      </td>
                      <td>
                        <button className="action-btn" onClick={() => handleDownload(file.id, file.original_name)}>
                          Download
                        </button>
                        <button className="action-btn action-btn-danger" onClick={() => handleRemove(file.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SharedWithMe;
