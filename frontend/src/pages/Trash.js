import React, { useState, useEffect } from 'react';
import { getTrashFiles, restoreFile, permanentDelete } from '../services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles.css';
import { useFeedback } from '../context/FeedbackContext';

function Trash() {
  const [files, setFiles] = useState([]);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [pageStatus, setPageStatus] = useState(null);
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
    fetchTrashFiles();
  }, [navigate]);

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
      setRestoringId(fileId);
      await restoreFile(fileId);
      notifySuccess('File restored successfully');
      fetchTrashFiles();
      setPageStatus({ type: 'success', message: 'File restored successfully.' });
    } catch (err) {
      const message = getErrorMessage(err, 'Restore failed');
      notifyError(message);
      setPageStatus({ type: 'danger', message });
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (fileId) => {
    const confirmed = await confirm({
      title: 'Delete File Forever?',
      message: 'This action cannot be undone.',
      confirmLabel: 'Delete Forever',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      setDeletingId(fileId);
      await permanentDelete(fileId);
      notifySuccess('File deleted permanently');
      fetchTrashFiles();
      setPageStatus({ type: 'success', message: 'File deleted permanently.' });
    } catch (err) {
      const message = getErrorMessage(err, 'Delete failed');
      notifyError(message);
      setPageStatus({ type: 'danger', message });
    } finally {
      setDeletingId(null);
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
          <img className="sidebar-logo-mark" src="/securecloud-logo.svg" alt="SecureCloud logo" />
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
            <div className="greeting">Trash</div>
            <div className="greeting-sub">Restore deleted files when needed or permanently remove them when you are certain.</div>
          </div>
        </div>

        <div className="content">
          {pageStatus && (
            <div className={`page-note ${pageStatus.type === 'danger' ? 'page-note-danger' : 'page-note-success'}`}>
              {pageStatus.message}
            </div>
          )}

          {files.length > 0 && (
            <div className="page-note page-note-danger">
              Files stay in trash until you restore them or delete them permanently.
            </div>
          )}

          <div className="section-heading">
            <h3 className="section-title">Trashed Files</h3>
            <span className="section-chip">{visibleFiles.length} items</span>
          </div>

          <div className="toolbar-row">
            <input
              className="toolbar-input"
              type="text"
              placeholder="Search trash"
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
              <p>{files.length === 0 ? 'Trash is empty!' : 'No trashed files match your current search.'}</p>
            </div>
          ) : (
            <div className="table-card">
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
                  {visibleFiles.map((file) => (
                    <tr key={file.id}>
                      <td>
                        <div className="file-main-cell">
                          <span className="file-type-pill">{getFileExtension(file.original_name)}</span>
                          <div className="file-meta-stack">
                            <span className="file-name-link static-file-name">{file.original_name}</span>
                            <div className="file-submeta">
                              <span>{file.owner_email}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{formatSize(file.size)}</td>
                      <td>{file.owner_email}</td>
                      <td>
                        <button
                          className="action-btn"
                          disabled={restoringId === file.id}
                          onClick={() => handleRestore(file.id)}
                        >
                          {restoringId === file.id ? 'Restoring...' : 'Restore'}
                        </button>
                        <button
                          className="action-btn action-btn-danger"
                          disabled={deletingId === file.id}
                          onClick={() => handlePermanentDelete(file.id)}
                        >
                          {deletingId === file.id ? 'Deleting...' : 'Delete Forever'}
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

export default Trash;
