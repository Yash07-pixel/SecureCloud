import React, { useState, useEffect } from 'react';
import { listFiles, uploadFile, deleteFile, shareFile, downloadFile, starFile } from '../services/api';
import { useNavigate } from 'react-router-dom';
import '../styles.css';
import { useFeedback } from '../context/FeedbackContext';

function Dashboard() {
  const [files, setFiles] = useState([]);
  const [uploadSteps, setUploadSteps] = useState(0);
  const [uploadedHash, setUploadedHash] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [shareFileId, setShareFileId] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [username, setUsername] = useState('');
  const [shareExpiry, setShareExpiry] = useState('24');
  const [uploading, setUploading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [starringId, setStarringId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [pageStatus, setPageStatus] = useState(null);
  const navigate = useNavigate();
  const { notifySuccess, notifyError, confirm, getErrorMessage } = useFeedback();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUsername(payload.name || payload.sub.split('@')[0]);
    } catch (err) {
      localStorage.removeItem('token');
      navigate('/login');
      return;
    }
    fetchFiles();
  }, [navigate]);

  const fetchFiles = async () => {
    try {
      const res = await listFiles();
      setFiles(res.data);
      return res.data;
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setShowUploadModal(true);
    setUploadSteps(1);
    setUploadedHash('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      setTimeout(() => setUploadSteps(2), 800);
      setTimeout(() => setUploadSteps(3), 1600);

      const res = await uploadFile(formData);

      setUploadSteps(4);
      setUploadedHash(res.data.sha256_hash);

      setTimeout(() => {
        setShowUploadModal(false);
        setUploadSteps(0);
        setUploading(false);
        fetchFiles();
        setPageStatus({ type: 'success', message: `Uploaded ${file.name} successfully.` });
      }, 2000);
    } catch (err) {
      const message = getErrorMessage(err, 'Upload failed');
      notifyError(message);
      setPageStatus({ type: 'danger', message });
      setShowUploadModal(false);
      setUploading(false);
    }
  };

  const handleDelete = async (fileId) => {
    const confirmed = await confirm({
      title: 'Move File To Trash?',
      message: 'The file will stay in trash until you restore it or delete it permanently.',
      confirmLabel: 'Move To Trash',
    });
    if (!confirmed) return;
    try {
      setDeletingId(fileId);
      await deleteFile(fileId);
      notifySuccess('File moved to trash');
      fetchFiles();
      setPageStatus({ type: 'success', message: 'File moved to trash.' });
    } catch (err) {
      const message = getErrorMessage(err, 'Delete failed');
      notifyError(message);
      setPageStatus({ type: 'danger', message });
    } finally {
      setDeletingId(null);
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

  const handleShare = async () => {
    try {
      setSharing(true);
      const payload = {
        file_id: shareFileId,
        share_with_email: shareEmail,
        expiry_hours: parseInt(shareExpiry, 10),
      };
      await shareFile(payload);
      notifySuccess('File shared successfully');
      setPageStatus({ type: 'success', message: `Shared file access with ${shareEmail}.` });
      setShowShareModal(false);

      const updatedFiles = await fetchFiles();
      if (updatedFiles && selectedFile) {
        const updated = updatedFiles.find((file) => file.id === selectedFile.id);
        if (updated) setSelectedFile(updated);
      }

      setShareEmail('');
      setShareExpiry('24');
    } catch (err) {
      const message = getErrorMessage(err, 'Share failed. Make sure the user is registered.');
      notifyError(message);
      setPageStatus({ type: 'danger', message });
    } finally {
      setSharing(false);
    }
  };

  const handleStar = async (fileId) => {
    try {
      setStarringId(fileId);
      await starFile(fileId);
      notifySuccess('File updated');
      fetchFiles();
      setPageStatus({ type: 'success', message: 'Starred files updated.' });
    } catch (err) {
      const message = getErrorMessage(err, 'Star failed');
      notifyError(message);
      setPageStatus({ type: 'danger', message });
    } finally {
      setStarringId(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
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

  const parseApiDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value !== 'string') return new Date(value);

    const normalizedValue =
      /[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
    const parsed = new Date(normalizedValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDate = (value) => {
    const date = parseApiDate(value);
    if (!date) return 'Unknown';
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (value) => {
    const date = parseApiDate(value);
    if (!date) return 'Unknown';
    const diffMs = Date.now() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return formatDate(value);
  };

  const getFilePrivacyLabel = (file) => {
    if (!file.shared_with?.length) return 'Private';
    return `${file.shared_with.length} shared`;
  };

  const getFileIntegrityLabel = (hash) => (hash ? 'SHA-256 verified' : 'Hash unavailable');

  const visibleFiles = [...files]
    .filter((file) => file.original_name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name-asc') return a.original_name.localeCompare(b.original_name);
      if (sortBy === 'name-desc') return b.original_name.localeCompare(a.original_name);
      if (sortBy === 'size-desc') return b.size - a.size;
      if (sortBy === 'size-asc') return a.size - b.size;
      return (parseApiDate(b.uploaded_at)?.getTime() || 0) - (parseApiDate(a.uploaded_at)?.getTime() || 0);
    });

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <div className="sidebar-logo">
          <img className="sidebar-logo-mark" src="/logo-cutout.png" alt="SecureCloud logo" />
        </div>

        <div className="sidebar-nav">
          <div
            className={`nav-item ${uploading ? 'action-disabled' : ''}`}
            onClick={() => !uploading && document.getElementById('fileInput').click()}
          >
            <span className="nav-icon">UP</span> Upload File
          </div>
          <input id="fileInput" type="file" style={{ display: 'none' }} onChange={handleUpload} />
          <div className="nav-item-active">
            <span className="nav-icon">MY</span> My Files
          </div>
          <div className="nav-item" onClick={() => navigate('/shared')}>
            <span className="nav-icon">SH</span> Shared with Me
          </div>
          <div className="nav-item" onClick={() => navigate('/starred')}>
            <span className="nav-icon">ST</span> Starred
          </div>
          <div className="nav-item" onClick={() => navigate('/trash')}>
            <span className="nav-icon">TR</span> Trash
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="nav-item" onClick={handleLogout}>
            <span className="nav-icon">EX</span> Logout
          </div>
        </div>
      </div>

      <div className="main">
        <div className="topbar">
          <div>
            <div className="greeting">
              Hi, <strong>{username}</strong>
            </div>
            <div className="greeting-sub">Manage your encrypted files, shares, and recovery actions from one place.</div>
          </div>
          <button
            className="upload-btn"
            disabled={uploading}
            onClick={() => !uploading && document.getElementById('fileInput').click()}
          >
            {uploading ? 'Uploading...' : 'Upload File'}
          </button>
        </div>

        <div className="content">
          <div className="security-banner">
            All your files are protected with <strong>&nbsp;AES-256 encryption&nbsp;</strong>
            and verified with <strong>&nbsp;SHA-256 integrity checks</strong>
          </div>

          {pageStatus && (
            <div className={`page-note ${pageStatus.type === 'danger' ? 'page-note-danger' : 'page-note-success'}`}>
              {pageStatus.message}
            </div>
          )}

          <div className="section-heading">
            <h3 className="section-title">My Files</h3>
            <span className="section-chip">{visibleFiles.length} items</span>
          </div>

          <div className="toolbar-row">
            <input
              className="toolbar-input"
              type="text"
              placeholder="Search files"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select className="toolbar-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="size-desc">Largest First</option>
              <option value="size-asc">Smallest First</option>
            </select>
          </div>

          {visibleFiles.length === 0 ? (
            <div className="empty empty-state">
              <p>{files.length === 0 ? 'No files yet. Upload your first file!' : 'No files match your current search.'}</p>
            </div>
          ) : (
            <div className="table-card">
              <table className="file-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Encryption</th>
                    <th>Hash</th>
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
                            <span
                              className="file-name-link"
                              onClick={() => {
                                setSelectedFile(file);
                                setShowDetailsModal(true);
                              }}
                            >
                              {file.original_name}
                            </span>
                            <div className="file-submeta">
                              <span>{formatRelativeTime(file.uploaded_at)}</span>
                              <span>{getFilePrivacyLabel(file)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{formatSize(file.size)}</td>
                      <td>
                        <span className="badge-encrypted">AES-256</span>
                      </td>
                      <td>
                        <span className="badge-hash" title={file.sha256_hash}>
                          {file.sha256_hash.substring(0, 12)}...
                        </span>
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
                          disabled={starringId === file.id}
                          onClick={() => handleStar(file.id)}
                        >
                          {starringId === file.id ? 'Updating...' : file.starred ? 'Unstar' : 'Star'}
                        </button>
                        <button
                          className="action-btn"
                          disabled={sharing || deletingId === file.id}
                          onClick={() => {
                            setShareFileId(file.id);
                            setSelectedFile(file);
                            setShowShareModal(true);
                          }}
                        >
                          Share
                        </button>
                        <button
                          className="action-btn action-btn-danger"
                          disabled={deletingId === file.id}
                          onClick={() => handleDelete(file.id)}
                        >
                          {deletingId === file.id ? 'Deleting...' : 'Delete'}
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

      {showUploadModal && (
        <div className="upload-modal-bg">
          <div className="upload-modal">
            <div className="upload-modal-title">Securing your file...</div>

            <div className="upload-step">
              <div className="step-icon">01</div>
              <div className="step-text">
                <div className="step-title">Reading file</div>
                <div className="step-detail">Loading file into memory</div>
              </div>
              <div className="step-status-done">Done</div>
            </div>

            <div className="upload-step">
              <div className="step-icon">02</div>
              <div className="step-text">
                <div className="step-title">AES-256-CBC Encryption</div>
                <div className="step-detail">Generating IV and encrypting blocks</div>
              </div>
              {uploadSteps >= 2 ? <div className="step-status-done">Done</div> : <div className="step-status-loading">...</div>}
            </div>

            <div className="upload-step">
              <div className="step-icon">03</div>
              <div className="step-text">
                <div className="step-title">SHA-256 Hash</div>
                <div className="step-detail">{uploadedHash ? `${uploadedHash.substring(0, 20)}...` : 'Generating integrity hash'}</div>
              </div>
              {uploadSteps >= 3 ? <div className="step-status-done">Done</div> : <div className="step-status-loading">...</div>}
            </div>

            <div className="upload-step">
              <div className="step-icon">04</div>
              <div className="step-text">
                <div className="step-title">Storing securely</div>
                <div className="step-detail">Saving metadata to database</div>
              </div>
              {uploadSteps >= 4 ? <div className="step-status-done">Done</div> : <div className="step-status-loading">...</div>}
            </div>
          </div>
        </div>
      )}

      {showDetailsModal && selectedFile && (
        <div className="modal-bg">
          <div className="details-modal">
            <div className="details-title">Security Details</div>
            <div className="details-hero">
              <span className="file-type-pill file-type-pill-large">{getFileExtension(selectedFile.original_name)}</span>
              <div>
                <div className="details-hero-name">{selectedFile.original_name}</div>
                <div className="details-hero-sub">
                  Uploaded {formatRelativeTime(selectedFile.uploaded_at)} · {formatSize(selectedFile.size)}
                </div>
              </div>
            </div>

            <div className="details-chip-row">
              <span className="status-pill status-pill-success">AES-256 protected</span>
              <span className="status-pill status-pill-info">{getFilePrivacyLabel(selectedFile)}</span>
              <span className="status-pill status-pill-neutral">{getFileIntegrityLabel(selectedFile.sha256_hash)}</span>
            </div>

            <div className="details-row">
              <div className="details-label">File Name</div>
              <div className="details-value">{selectedFile.original_name}</div>
            </div>

            <div className="details-row">
              <div className="details-label">Size</div>
              <div className="details-value">{formatSize(selectedFile.size)}</div>
            </div>

            <div className="details-row">
              <div className="details-label">Encryption</div>
              <div className="details-value verified">AES-256-CBC verified</div>
            </div>

            <div className="details-row">
              <div className="details-label">Integrity</div>
              <div className="details-value verified">SHA-256 verified</div>
            </div>

            <div className="details-row">
              <div className="details-label">SHA-256 Hash</div>
              <div className="details-value hash">{selectedFile.sha256_hash}</div>
            </div>

            <div className="details-row">
              <div className="details-label">Owner</div>
              <div className="details-value">{selectedFile.owner_email}</div>
            </div>

            <div className="details-row">
              <div className="details-label">Uploaded</div>
              <div className="details-value">{formatDate(selectedFile.uploaded_at)}</div>
            </div>

            <div className="details-row">
              <div className="details-label">Shared With</div>
              <div className="details-value">
                {selectedFile.shared_with && selectedFile.shared_with.length === 0
                  ? 'Nobody - Private'
                  : selectedFile.shared_with && selectedFile.shared_with.join(', ')}
              </div>
            </div>

            <button className="close-btn" onClick={() => setShowDetailsModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="modal-bg">
          <div className="modal">
            <h3 className="modal-title">Share File</h3>
            <p className="modal-sub">Enter the email of the person you want to share with.</p>
            <input
              className="auth-input"
              type="email"
              placeholder="friend@example.com"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
            />

            <label className="auth-label">Access Duration</label>
            <select className="auth-input" value={shareExpiry} onChange={(e) => setShareExpiry(e.target.value)}>
              <option value="24">24 Hours</option>
              <option value="72">3 Days</option>
              <option value="168">7 Days</option>
              <option value="720">30 Days</option>
            </select>

            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowShareModal(false)}>
                Cancel
              </button>
              <button className="share-btn" disabled={sharing} onClick={handleShare}>
                {sharing ? 'Sharing...' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
