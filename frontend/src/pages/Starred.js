import React, { useState, useEffect } from 'react';
import { getStarredFiles, downloadFile, starFile } from '../services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles.css';
import { useFeedback } from '../context/FeedbackContext';

function Starred() {
  const [files, setFiles] = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);
  const [unstarringId, setUnstarringId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [pageStatus, setPageStatus] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { notifySuccess, notifyError, getErrorMessage } = useFeedback();

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
    fetchStarredFiles();
  }, [navigate]);

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
      setUnstarringId(fileId);
      await starFile(fileId);
      notifySuccess('File removed from starred');
      fetchStarredFiles();
      setPageStatus({ type: 'success', message: 'File removed from starred.' });
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to unstar');
      notifyError(message);
      setPageStatus({ type: 'danger', message });
    } finally {
      setUnstarringId(null);
    }
  };

  const handleDownload = async (fileId, filename) => {
    try {
      setDownloadingId(fileId);
      const res = await downloadFile(fileId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setPageStatus({ type: 'success', message: `Downloaded ${filename}.` });
    } catch (err) {
      const message = getErrorMessage(err, 'Download failed');
      notifyError(message);
      setPageStatus({ type: 'danger', message });
    } finally {
      setDownloadingId(null);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileExtension = (filename) => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toUpperCase() : 'FILE';
  };

  const visibleFiles = [...files]
    .filter((file) => file.original_name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name-asc') return a.original_name.localeCompare(b.original_name);
      if (sortBy === 'name-desc') return b.original_name.localeCompare(a.original_name);
      if (sortBy === 'size-desc') return b.size - a.size;
      if (sortBy === 'size-asc') return a.size - b.size;
      return 0;
    });

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <div className="sidebar-logo">
          <img className="sidebar-logo-mark" src="/image.png" alt="SecureCloud logo" />
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
            <div className="greeting">Starred Files</div>
            <div className="greeting-sub">Keep your most important documents close and remove stars whenever priorities change.</div>
          </div>
        </div>

        <div className="content">
          {pageStatus && (
            <div className={`page-note ${pageStatus.type === 'danger' ? 'page-note-danger' : 'page-note-success'}`}>
              {pageStatus.message}
            </div>
          )}

          <div className="section-heading">
            <h3 className="section-title">Your Starred Files</h3>
            <span className="section-chip">{visibleFiles.length} items</span>
          </div>

          <div className="toolbar-row">
            <input
              className="toolbar-input"
              type="text"
              placeholder="Search starred files"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select className="toolbar-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="size-desc">Largest First</option>
              <option value="size-asc">Smallest First</option>
            </select>
          </div>

          {visibleFiles.length === 0 ? (
            <div className="empty empty-state">
              <p>{files.length === 0 ? 'No starred files yet. Star a file from My Files!' : 'No starred files match your current search.'}</p>
            </div>
          ) : (
            <div className="table-card">
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
                  {visibleFiles.map((file) => (
                    <tr key={file.id}>
                      <td>
                        <div className="file-main-cell">
                          <span className="file-type-pill">{getFileExtension(file.original_name)}</span>
                          <div className="file-meta-stack">
                            <span className="file-name-link static-file-name">{file.original_name}</span>
                            <div className="file-submeta">
                              <span>Starred file</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{formatSize(file.size)}</td>
                      <td>
                        <span className="badge-encrypted">AES-256</span>
                      </td>
                      <td>
                        <button
                          className="action-btn"
                          disabled={downloadingId === file.id}
                          onClick={() => handleDownload(file.id, file.original_name)}
                        >
                          {downloadingId === file.id ? 'Downloading...' : 'Download'}
                        </button>
                        <button
                          className="action-btn"
                          disabled={unstarringId === file.id}
                          onClick={() => handleUnstar(file.id)}
                        >
                          {unstarringId === file.id ? 'Updating...' : 'Unstar'}
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

export default Starred;
