import React, { useState, useEffect } from 'react';
import { getStarredFiles, downloadFile, starFile } from '../services/api';
import { useNavigate } from 'react-router-dom';
import '../styles.css';

function Starred() {
  const [files, setFiles] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchStarredFiles();
  }, []);

  const fetchStarredFiles = async () => {
    try {
      const res = await getStarredFiles();
      setFiles(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnstar = async (fileId) => {
    try {
      await starFile(fileId);
      fetchStarredFiles();
    } catch (err) {
      alert('Failed to unstar');
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
      alert('Download failed');
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <div className="sidebar-logo">🔐 SecureCloud</div>
        <div className="nav-item" onClick={() => navigate('/dashboard')}>📁 My Files</div>
        <div className="nav-item" onClick={() => navigate('/shared')}>🔗 Shared with Me</div>
        <div className="nav-item-active">⭐ Starred</div>
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
          <div className="greeting">⭐ Starred Files</div>
        </div>

        <div className="content">
          <h3 className="section-title">Your Starred Files</h3>

          {files.length === 0 ? (
            <div className="empty">
              <p>No starred files yet. Star a file from My Files!</p>
            </div>
          ) : (
            <table className="file-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Encryption</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td>📄 {file.original_name}</td>
                    <td>{formatSize(file.size)}</td>
                    <td>
                      <span className="badge-encrypted">🔒 AES-256</span>
                    </td>
                    <td>
                      <button
                        className="action-btn"
                        onClick={() => handleDownload(file.id, file.original_name)}
                      >
                        ⬇ Download
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => handleUnstar(file.id)}
                      >
                        ★ Unstar
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

export default Starred;