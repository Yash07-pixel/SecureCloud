import axios from 'axios';

export const API_BASE_URL = 'https://securecloud-341u.onrender.com';
const ACCESS_TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refresh_token';

const API = axios.create({
  baseURL: API_BASE_URL
});

export const storeAuthTokens = ({ access_token, refresh_token }) => {
  if (access_token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access_token);
  }
  if (refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
  }
};

export const clearStoredAuth = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);
let refreshRequest = null;

const refreshAuthToken = async () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  if (!refreshRequest) {
    refreshRequest = axios
      .post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
      .then((response) => {
        storeAuthTokens(response.data);
        return response.data;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
};

// Automatically attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const isAuthEndpoint = originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        const tokens = await refreshAuthToken();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${tokens.access_token}`;
        return API(originalRequest);
      } catch (refreshError) {
        clearStoredAuth();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 401) {
      clearStoredAuth();
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
export const logoutUser = () => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return Promise.resolve();
  }
  return API.post('/auth/logout', { refresh_token: refreshToken });
};

// Drive
export const getDriveStatus = () => API.get('/drive/status');
export const getDriveConnectUrl = () => API.get('/drive/connect');
export const disconnectDrive = () => API.post('/drive/disconnect');

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
