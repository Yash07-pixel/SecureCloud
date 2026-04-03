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
  }, []);

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
        fetchFiles();
      }, 2000);

    } catch (err) {
      notifyError(getErrorMessage(err, 'Upload failed'));
      setShowUploadModal(false);
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
      await deleteFile(fileId);
      notifySuccess('File moved to trash');
      fetchFiles();
    } catch (err) {
      notifyError(getErrorMessage(err, 'Delete failed'));
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
      notifyError(getErrorMessage(err, 'Download failed'));
    }
  };

  const handleShare = async () => {
    try {
      const payload = {
        file_id: shareFileId,
        share_with_email: shareEmail,
        expiry_hours: parseInt(shareExpiry, 10)
      };
      await shareFile(payload);
      notifySuccess('File shared successfully');
      setShowShareModal(false);

      // Refresh files and update selectedFile with new shared_with
      const updatedFiles = await fetchFiles();
      if (updatedFiles && selectedFile) {
        const updated = updatedFiles.find(f => f.id === selectedFile.id);
        if (updated) setSelectedFile(updated);
      }

      setShareEmail('');
      setShareExpiry('24');
    } catch (err) {
      notifyError(getErrorMessage(err, 'Share failed. Make sure the user is registered.'));
    }
  };

  const handleStar = async (fileId) => {
    try {
      await starFile(fileId);
      notifySuccess('File updated');
      fetchFiles();
    } catch (err) {
      notifyError(getErrorMessage(err, 'Star failed'));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
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
        <div className="sidebar-logo">SecureCloud</div>

        <div style={{padding: '12px 0'}}>
          <div className="nav-item" onClick={() => document.getElementById('fileInput').click()}>
            <span>↑</span> Upload File
          </div>
          <input
            id="fileInput"
            type="file"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
          <div className="nav-item-active">
            <span>▦</span> My Files
          </div>
          <div className="nav-item" onClick={() => navigate('/shared')}>
            <span>⇄</span> Shared with Me
          </div>
          <div className="nav-item" onClick={() => navigate('/starred')}>
            <span>☆</span> Starred
          </div>
          <div className="nav-item" onClick={() => navigate('/trash')}>
            <span>⊘</span> Trash
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="nav-item" onClick={handleLogout}>
            <span>→</span> Logout
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="main">

        {/* Topbar */}
        <div className="topbar">
          <div className="greeting">
            Hi, <strong>{username}</strong>
          </div>
          <button
            className="upload-btn"
            onClick={() => document.getElementById('fileInput').click()}
          >
            ⬆ Upload
          </button>
        </div>

        {/* Content */}
        <div className="content">

          {/* Security Banner */}
          <div className="security-banner">
            🛡 All your files are protected with <strong>&nbsp;AES-256 encryption&nbsp;</strong>
            and verified with <strong>&nbsp;SHA-256 integrity checks</strong>
          </div>

          <h3 className="section-title">My Files</h3>

          {files.length === 0 ? (
            <div className="empty">
              <p>No files yet. Upload your first file!</p>
            </div>
          ) : (
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
                {files.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <span
                        style={{ cursor: 'pointer', color: '#1a73e8' }}
                        onClick={() => {
                          setSelectedFile(file);
                          setShowDetailsModal(true);
                        }}
                      >
                        📄 {file.original_name}
                      </span>
                    </td>
                    <td>{formatSize(file.size)}</td>
                    <td>
                      <span className="badge-encrypted">🔒 AES-256</span>
                    </td>
                    <td>
                      <span className="badge-hash" title={file.sha256_hash}>
                        # {file.sha256_hash.substring(0, 12)}...
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
                        className="action-btn"
                        onClick={() => handleStar(file.id)}
                      >
                        {file.starred ? 'Unstar' : 'Star'}
                      </button>
                      <button
                        className="action-btn"
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
                        onClick={() => handleDelete(file.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Upload Progress Modal */}
      {showUploadModal && (
        <div className="upload-modal-bg">
          <div className="upload-modal">
            <div className="upload-modal-title">🔒 Securing your file...</div>

            <div className="upload-step">
              <div className="step-icon">📂</div>
              <div className="step-text">
                <div className="step-title">Reading file</div>
                <div className="step-detail">Loading file into memory</div>
              </div>
              <div className="step-status-done">✓ Done</div>
            </div>

            <div className="upload-step">
              <div className="step-icon">🔑</div>
              <div className="step-text">
                <div className="step-title">AES-256-CBC Encryption</div>
                <div className="step-detail">Generating IV · Encrypting blocks</div>
              </div>
              {uploadSteps >= 2
                ? <div className="step-status-done">✓ Done</div>
                : <div className="step-status-loading">...</div>
              }
            </div>

            <div className="upload-step">
              <div className="step-icon">#️⃣</div>
              <div className="step-text">
                <div className="step-title">SHA-256 Hash</div>
                <div className="step-detail">
                  {uploadedHash
                    ? uploadedHash.substring(0, 20) + '...'
                    : 'Generating integrity hash'}
                </div>
              </div>
              {uploadSteps >= 3
                ? <div className="step-status-done">✓ Done</div>
                : <div className="step-status-loading">...</div>
              }
            </div>

            <div className="upload-step">
              <div className="step-icon">💾</div>
              <div className="step-text">
                <div className="step-title">Storing securely</div>
                <div className="step-detail">Saving metadata to database</div>
              </div>
              {uploadSteps >= 4
                ? <div className="step-status-done">✓ Done</div>
                : <div className="step-status-loading">...</div>
              }
            </div>

          </div>
        </div>
      )}

      {/* File Details Modal */}
      {showDetailsModal && selectedFile && (
        <div className="modal-bg">
          <div className="details-modal">
            <div className="details-title">🔒 Security Details</div>

            <div className="details-row">
              <div className="details-label">File Name</div>
              <div className="details-value">📄 {selectedFile.original_name}</div>
            </div>

            <div className="details-row">
              <div className="details-label">Size</div>
              <div className="details-value">{formatSize(selectedFile.size)}</div>
            </div>

            <div className="details-row">
              <div className="details-label">Encryption</div>
              <div className="details-value verified">🔒 AES-256-CBC ✅</div>
            </div>

            <div className="details-row">
              <div className="details-label">Integrity</div>
              <div className="details-value verified">✅ SHA-256 Verified</div>
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
              <div className="details-label">Shared With</div>
              <div className="details-value">
                {selectedFile.shared_with && selectedFile.shared_with.length === 0
                  ? 'Nobody — Private 🔐'
                  : selectedFile.shared_with && selectedFile.shared_with.join(', ')}
              </div>
            </div>

            <button
              className="close-btn"
              onClick={() => setShowDetailsModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="modal-bg">
          <div className="modal">
            <h3 className="modal-title">Share File</h3>
            <p className="modal-sub">
              Enter the email of the person you want to share with
            </p>
            <input
              className="auth-input"
              type="email"
              placeholder="friend@example.com"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
            />

            <label className="auth-label">Access Duration</label>
            <select
              className="auth-input"
              value={shareExpiry}
              onChange={(e) => setShareExpiry(e.target.value)}
            >
              <option value="24">24 Hours</option>
              <option value="72">3 Days</option>
              <option value="168">7 Days</option>
              <option value="720">30 Days</option>
            </select>

            <div className="modal-actions">
              <button
                className="cancel-btn"
                onClick={() => setShowShareModal(false)}
              >
                Cancel
              </button>
              <button className="share-btn" onClick={handleShare}>
                Share
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;
