import React, { useState, useEffect } from 'react';
import { getSharedFiles, downloadFile, removeSharedFile } from '../services/api';
import '../styles.css';
import { useNavigate, useLocation } from 'react-router-dom';

function SharedWithMe() {
  const [files, setFiles] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
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
      alert('Download failed or access has expired');
    }
  };

  const handleRemove = async (fileId) => {
    if (!window.confirm('Remove this file from your shared list?')) return;
    try {
      await removeSharedFile(fileId);
      fetchSharedFiles();
    } catch (err) {
      alert('Failed to remove file');
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatExpiry = (expiry, hoursRemaining) => {
    if (!expiry) return 'Never expires';
    if (hoursRemaining === 0) return 'Access expired!';
    if (hoursRemaining < 24) return `${hoursRemaining}h remaining`;
    const days = Math.floor(hoursRemaining / 24);
    const hours = hoursRemaining % 24;
    return `${days}d ${hours}h remaining`;
  };

  return (
    <div className="dashboard-container">

      {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-logo">SecureCloud</div>
          <div style={{padding: '12px 0'}}>
            <div className="nav-item" onClick={() => navigate('/dashboard')}>
              <span style={{width:'20px',display:'inline-block',textAlign:'center',marginRight:'4px',color:'#888',fontSize:'15px'}}>▦</span> My Files
            </div>
            <div className={location.pathname === '/shared' ? 'nav-item-active' : 'nav-item'} onClick={() => navigate('/shared')}>
              <span style={{width:'20px',display:'inline-block',textAlign:'center',marginRight:'4px',color:'#888',fontSize:'15px'}}>⇄</span> Shared with Me
            </div>
            <div className={location.pathname === '/starred' ? 'nav-item-active' : 'nav-item'} onClick={() => navigate('/starred')}>
              <span style={{width:'20px',display:'inline-block',textAlign:'center',marginRight:'4px',color:'#888',fontSize:'15px'}}>☆</span> Starred
            </div>
            <div className={location.pathname === '/trash' ? 'nav-item-active' : 'nav-item'} onClick={() => navigate('/trash')}>
              <span style={{width:'20px',display:'inline-block',textAlign:'center',marginRight:'4px',color:'#888',fontSize:'15px'}}>⊘</span> Trash
            </div>
          </div>
          <div className="sidebar-footer">
            <div className="nav-item" onClick={() => {
              localStorage.removeItem('token');
              navigate('/login');
            }}>
              <span style={{width:'20px',display:'inline-block',textAlign:'center',marginRight:'4px',color:'#888',fontSize:'15px'}}>→</span> Logout
            </div>
          </div>
        </div>

      {/* Main */}
      <div className="main">
        <div className="topbar">
          <div className="greeting">Shared with Me</div>
        </div>

        <div className="content">
          <div className="security-banner">
            🔒 You can only <strong>&nbsp;download&nbsp;</strong> files shared with you.
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
                        fontSize: '12px',
                        color: file.expiry ? '#d93025' : '#188038',
                        fontWeight: '500'
                      }}>
                        {formatExpiry(file.expiry, file.hours_remaining)}
                      </span>
                    </td>
                    <td>
                      <button
                        className="action-btn"
                        onClick={() => handleDownload(file.id, file.original_name)}
                      >
                        Download
                      </button>
                      <button
                        className="action-btn action-btn-danger"
                        onClick={() => handleRemove(file.id)}
                      >
                        Remove
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
