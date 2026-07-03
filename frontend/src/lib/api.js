import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

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

export const userAPI = {
  kycSubmit: (data) => api.post('/users/kyc/submit', data).then(r => r.data),
  kycStatus: () => api.get('/users/kyc/status').then(r => r.data),
};

export const adminAPI = {
  stats: () => api.get('/admin/stats').then(r => r.data),
  users: () => api.get('/admin/users').then(r => r.data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data).then(r => r.data),
  suspendUser: (id) => api.post(`/admin/users/${id}/suspend`).then(r => r.data),
  unsuspendUser: (id) => api.post(`/admin/users/${id}/unsuspend`).then(r => r.data),
  orders: () => api.get('/admin/orders').then(r => r.data),
  refundOrder: (id) => api.post(`/admin/orders/${id}/refund`).then(r => r.data),
  payments: () => api.get('/admin/payments').then(r => r.data),
  contests: () => api.get('/admin/contests').then(r => r.data),
  updateContest: (id, data) => api.put(`/admin/contests/${id}`, data).then(r => r.data),
  winners: () => api.get('/admin/winners').then(r => r.data),
  draw: (contestId) => api.post(`/admin/draw/${contestId}`).then(r => r.data),
  markPaid: (winnerId) => api.post(`/admin/winners/${winnerId}/mark-paid`).then(r => r.data),
  launchContest: (contestId) => api.post(`/admin/contests/${contestId}/launch`).then(r => r.data),
  pauseContest: (contestId) => api.post(`/admin/contests/${contestId}/pause`).then(r => r.data),
  deleteContest: (contestId) => api.delete(`/admin/contests/${contestId}`).then(r => r.data),
  kycList: (status = 'all') => api.get('/admin/kyc', { params: { status } }).then(r => r.data),
  kycApprove: (id) => api.post(`/admin/kyc/${id}/approve`).then(r => r.data),
  kycReject: (id, reason) => api.post(`/admin/kyc/${id}/reject`, { reason }).then(r => r.data),
};
