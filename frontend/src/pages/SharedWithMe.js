import React, { useState, useEffect } from 'react';
import { getSharedFiles, downloadFile } from '../services/api';
import { useNavigate } from 'react-router-dom';
import '../styles.css';

function SharedWithMe() {
  const [files, setFiles] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchSharedFiles();
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
      alert('Download failed or access has expired');
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatExpiry = (expiry) => {
    if (!expiry) return 'Never expires';
    const date = new Date(expiry);
    return 'Expires: ' + date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <div className="sidebar-logo">🔐 SecureCloud</div>
        <div className="nav-item" onClick={() => navigate('/dashboard')}>📁 My Files</div>
        <div className="nav-item-active">🔗 Shared with Me</div>
        <div className="nav-item" onClick={() => navigate('/starred')}>⭐ Starred</div>
        <div className="nav-item" onClick={() => navigate('/trash')}>🗑 Trash</div>
        <div className="sidebar-footer">
          <div className="nav-item" onClick={() => {
            localStorage.removeItem('token');
            navigate('/login');
          }}>
            🚪 Logout
          </div>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <div className="greeting">🔗 Shared with Me</div>
        </div>

        <div className="content">

          <div className="security-banner">
            🛡 You can only <strong>&nbsp;download&nbsp;</strong> files shared with you.
            Sharing is restricted to file owners only.
          </div>

          <h3 className="section-title">Files Shared with You</h3>

          {files.length === 0 ? (
            <div className="empty">
              <p>No files shared with you yet.</p>
            </div>
          ) : (
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
                    <td>📄 {file.original_name}</td>
                    <td>{formatSize(file.size)}</td>
                    <td>{file.owner_email}</td>
                    <td>
                      <span className="badge-encrypted">🔒 AES-256</span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '11px',
                        color: file.expiry ? '#d93025' : '#188038',
                        fontFamily: 'monospace'
                      }}>
                        {formatExpiry(file.expiry)}
                      </span>
                    </td>
                    <td>
                      <button
                        className="action-btn"
                        onClick={() => handleDownload(file.id, file.original_name)}
                      >
                        ⬇ Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default SharedWithMe;