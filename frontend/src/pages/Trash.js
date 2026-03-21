import React, { useState, useEffect } from 'react';
import { getTrashFiles, restoreFile, permanentDelete } from '../services/api';
import { useNavigate } from 'react-router-dom';
import '../styles.css';

function Trash() {
  const [files, setFiles] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    fetchTrashFiles();
  }, []);

  const fetchTrashFiles = async () => {
    try {
      const res = await getTrashFiles();
      setFiles(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestore = async (fileId) => {
    try {
      await restoreFile(fileId);
      fetchTrashFiles();
    } catch (err) {
      alert('Restore failed');
    }
  };

  const handlePermanentDelete = async (fileId) => {
    if (!window.confirm('Permanently delete this file? This cannot be undone!')) return;
    try {
      await permanentDelete(fileId);
      fetchTrashFiles();
    } catch (err) {
      alert('Delete failed');
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="dashboard-container">

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-logo">🔐 SecureCloud</div>
        <div className="nav-item" onClick={() => navigate('/dashboard')}>📁 My Files</div>
        <div className="nav-item" onClick={() => navigate('/shared')}>🔗 Shared with Me</div>
        <div className="nav-item" onClick={() => navigate('/starred')}>⭐ Starred</div>
        <div className="nav-item-active">🗑 Trash</div>
        <div className="sidebar-footer">
          <div className="nav-item" onClick={() => {
            localStorage.removeItem('token');
            navigate('/login');
          }}>
            🚪 Logout
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="main">
        <div className="topbar">
          <div className="greeting">🗑 Trash</div>
        </div>

        <div className="content">
          {files.length > 0 && (
            <div style={{
              background: '#fce8e6',
              border: '1px solid #f5c6c2',
              borderRadius: '8px',
              padding: '12px 20px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#d93025'
            }}>
              ⚠ Files in trash will be permanently deleted after 30 days.
            </div>
          )}

          <h3 className="section-title">Trashed Files</h3>

          {files.length === 0 ? (
            <div className="empty">
              <p>Trash is empty! 🎉</p>
            </div>
          ) : (
            <table className="file-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Owner</th>
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
                      <button
                        className="action-btn"
                        onClick={() => handleRestore(file.id)}
                      >
                        ↩ Restore
                      </button>
                      <button
                        className="action-btn action-btn-danger"
                        onClick={() => handlePermanentDelete(file.id)}
                      >
                        🗑 Delete Forever
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

export default Trash;