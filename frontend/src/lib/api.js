import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gz_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authAPI = {
  register: (data) => api.post('/auth/register', data).then(r => r.data),
  login: (data) => api.post('/auth/login', data).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  googleSession: (sessionId) => api.post('/auth/session', {}, { headers: { 'X-Session-ID': sessionId } }).then(r => r.data),
};

export const contestsAPI = {
  list: (params = {}) => api.get('/contests', { params }).then(r => r.data),
  get: (slug) => api.get(`/contests/${slug}`).then(r => r.data),
  verifySkill: (slug, answer) => api.post(`/contests/${slug}/verify-skill`, { answer }).then(r => r.data),
};

export const ordersAPI = {
  checkout: (items) => api.post('/orders/checkout', { items }).then(r => r.data),
  mine: () => api.get('/orders/mine').then(r => r.data),
  myTickets: () => api.get('/orders/my-tickets').then(r => r.data),
};

export const publicAPI = {
  winners: () => api.get('/public/winners').then(r => r.data),
  stats: () => api.get('/public/stats').then(r => r.data),
};

export const adminAPI = {
  stats: () => api.get('/admin/stats').then(r => r.data),
  users: () => api.get('/admin/users').then(r => r.data),
  orders: () => api.get('/admin/orders').then(r => r.data),
  contests: () => api.get('/admin/contests').then(r => r.data),
  winners: () => api.get('/admin/winners').then(r => r.data),
  draw: (contestId) => api.post(`/admin/draw/${contestId}`).then(r => r.data),
  markPaid: (winnerId) => api.post(`/admin/winners/${winnerId}/mark-paid`).then(r => r.data),
};
