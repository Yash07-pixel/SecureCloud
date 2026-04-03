import React, { useState, useEffect } from 'react';
import { getTrashFiles, restoreFile, permanentDelete } from '../services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles.css';
import { useFeedback } from '../context/FeedbackContext';

function Trash() {
  const [files, setFiles] = useState([]);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
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
      setRestoringId(fileId);
      await restoreFile(fileId);
      notifySuccess('File restored successfully');
      fetchTrashFiles();
    } catch (err) {
      notifyError(getErrorMessage(err, 'Restore failed'));
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
    } catch (err) {
      notifyError(getErrorMessage(err, 'Delete failed'));
    } finally {
      setDeletingId(null);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
            <div className="greeting">Trash</div>
            <div className="greeting-sub">Restore deleted files when needed or permanently remove them when you are certain.</div>
          </div>
        </div>

        <div className="content">
          {files.length > 0 && (
            <div className="page-note page-note-danger">
              Files stay in trash until you restore them or delete them permanently.
            </div>
          )}

          <div className="section-heading">
            <h3 className="section-title">Trashed Files</h3>
            <span className="section-chip">{files.length} items</span>
          </div>

          {files.length === 0 ? (
            <div className="empty empty-state">
              <p>Trash is empty!</p>
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
                  {files.map((file) => (
                    <tr key={file.id}>
                      <td><span className="file-name-link static-file-name">{file.original_name}</span></td>
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
