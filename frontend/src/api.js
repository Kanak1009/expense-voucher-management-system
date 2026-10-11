import axios from 'axios';

export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || '';
export const assetUrl = (path) => (path ? `${API_ORIGIN}${path}` : null);

const api = axios.create({ baseURL: `${API_ORIGIN}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A 401 on any protected call means the session is gone -> back to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLogin = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLogin) {
      localStorage.removeItem('token');
      window.location.assign('/login');
    }
    return Promise.reject(err);
  }
);

// Normalises server errors -> { message, fieldErrors }
export const parseError = (err) => ({
  message: err.response?.data?.message || err.message || 'Something went wrong',
  fieldErrors: err.response?.data?.errors || {},
});

export default api;
