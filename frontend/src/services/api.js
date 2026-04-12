import axios from 'axios';

export const API_BASE_URL = 'https://securecloud-341u.onrender.com';

const API = axios.create({
  baseURL: API_BASE_URL
});

// Automatically attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const registerUser = (data) => API.post('/auth/register', data);
export const loginUser = (data) => API.post('/auth/login', data);

// Files
export const uploadFile = (formData) => API.post('/files/upload', formData);
export const listFiles = () => API.get('/files/');
export const downloadFile = (fileId) => API.get(`/files/download/${fileId}`, { responseType: 'blob' });
export const shareFile = (data) => API.post('/files/share', data);
export const deleteFile = (fileId) => API.delete(`/files/${fileId}`);

// New
export const getSharedFiles = () => API.get('/files/shared');
export const getStarredFiles = () => API.get('/files/starred');
export const getTrashFiles = () => API.get('/files/trash');
export const starFile = (fileId) => API.patch(`/files/star/${fileId}`);
export const restoreFile = (fileId) => API.patch(`/files/trash/restore/${fileId}`);
export const permanentDelete = (fileId) => API.delete(`/files/trash/permanent/${fileId}`);
export const removeSharedFile = (fileId) => API.patch(`/files/shared/remove/${fileId}`);
