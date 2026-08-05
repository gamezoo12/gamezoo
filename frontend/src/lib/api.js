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
  otpSend: (phone) => api.post('/auth/otp/send', { phone }).then(r => r.data),
  otpVerifyBind: (phone, code) => api.post('/auth/otp/verify-bind', { phone, code }).then(r => r.data),
  otpLoginVerify: (phone, code) => api.post('/auth/otp/login-verify', { phone, code }).then(r => r.data),
  passwordResetSend: (phone) =>
    api.post('/auth/password-reset/send', { phone }).then(r => r.data),
  passwordResetConfirm: (phone, code, newPassword) =>
    api.post('/auth/password-reset/confirm', {
      phone,
      code,
      new_password: newPassword,
    }).then(r => r.data),
};

export const captchaAPI = {
  config: () => api.get('/config/turnstile').then(r => r.data),
  verify: (token, contest_id) => api.post('/games/captcha/verify', { token, contest_id }).then(r => r.data),
};

export const supportAPI = {
  create: (data) => api.post('/support', data).then(r => r.data),
  mine: () => api.get('/support/mine').then(r => r.data),
  reply: (case_id, message) => api.post(`/support/${case_id}/reply`, { message }).then(r => r.data),
};

export const contestsAPI = {
  list: (params = {}) => api.get('/contests', { params }).then(r => r.data),
  get: (slug) => api.get(`/contests/${slug}`).then(r => r.data),
  skillChallenge: (slug) => api.get(`/contests/${slug}/skill-challenge`).then(r => r.data),
  verifySkill: (slug, answer, challenge_token) =>
    api.post(`/contests/${slug}/verify-skill`, { answer, challenge_token }).then(r => r.data),
  recentWinners: () => api.get('/public/winners').then(r => r.data),
};

export const ordersAPI = {
  checkout: (items) => api.post('/orders/checkout', { items }).then(r => r.data),
  mine: () => api.get('/orders/mine').then(r => r.data),
  myTickets: (limit = 200) => api.get(`/orders/my-tickets?limit=${limit}`).then(r => r.data),
  myGames: () => api.get('/orders/my-games').then(r => r.data),
};

export const publicAPI = {
  winners: () => api.get('/public/winners').then(r => r.data),
  stats: () => api.get('/public/stats').then(r => r.data),
};

export const userAPI = {
  me: () => api.get('/users/me').then(r => r.data),
  updateMe: (data) => api.patch('/users/me', data).then(r => r.data),
  changePassword: (data) => api.post('/users/me/password', data).then(r => r.data),
  kycSubmit: (data) => api.post('/users/kyc/submit', data).then(r => r.data),
  kycStatus: () => api.get('/users/kyc/status').then(r => r.data),
  kycUpload: (kind, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/users/kyc/upload', fd, {
      params: { kind },
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  notifications: (onlyUnread = false) => api.get('/users/notifications', { params: { only_unread: onlyUnread } }).then(r => r.data),
  markAllRead: () => api.post('/users/notifications/mark-read').then(r => r.data),
  acceptTerms: () => api.post('/users/me/accept-terms').then(r => r.data),
};

export const productionAPI = {
  upcomingDraws: (hours = 24) => api.get('/production/upcoming-draws', { params: { hours } }).then(r => r.data),
  draw: (contestId) => api.post(`/production/draw/${contestId}`).then(r => r.data),
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
  createContest: (data) => api.post('/admin/contests', data).then(r => r.data),
  winners: () => api.get('/admin/winners').then(r => r.data),
  draw: (contestId) => api.post(`/admin/draw/${contestId}`).then(r => r.data),
  markPaid: (winnerId) => api.post(`/admin/winners/${winnerId}/mark-paid`).then(r => r.data),
  launchContest: (contestId) => api.post(`/admin/contests/${contestId}/launch`).then(r => r.data),
  pauseContest: (contestId) => api.post(`/admin/contests/${contestId}/pause`).then(r => r.data),
  bulkLaunch: (filter = {}) => api.post('/admin/contests/bulk/launch', filter).then(r => r.data),
  bulkPause: (filter = {}) => api.post('/admin/contests/bulk/pause', filter).then(r => r.data),
  deleteContest: (contestId) => api.delete(`/admin/contests/${contestId}`).then(r => r.data),
  // Winner selection
  wsEligibleTickets: (cid) => api.get(`/admin/winners/${cid}/eligible-tickets`).then(r => r.data),
  wsDraw: (cid) => api.post(`/admin/winners/${cid}/draw`).then(r => r.data),
  wsManual: (cid, ticket_number, reason) => api.post(`/admin/winners/${cid}/manual`, { ticket_number, reason }).then(r => r.data),
  wsPublish: (cid) => api.post(`/admin/winners/${cid}/publish`).then(r => r.data),
  wsCorrect: (cid, ticket_number, reason) => api.post(`/admin/winners/${cid}/correct`, { ticket_number, reason }).then(r => r.data),
  auditLogs: (limit = 200) => api.get('/admin/audit-logs', { params: { limit } }).then(r => r.data),
  supportCases: (status) => api.get('/admin/support/cases', { params: status ? { status } : {} }).then(r => r.data),
  supportReply: (case_id, message) => api.post(`/admin/support/cases/${case_id}/reply`, { message }).then(r => r.data),
  supportStatus: (case_id, status) => api.post(`/admin/support/cases/${case_id}/status`, { status }).then(r => r.data),
  wsAudit: (cid) => api.get(`/admin/winners/${cid}/audit`).then(r => r.data),
  kycList: (status = 'all') => api.get('/admin/kyc', { params: { status } }).then(r => r.data),
  kycApprove: (id) => api.post(`/admin/kyc/${id}/approve`).then(r => r.data),
  kycReject: (id, reason) => api.post(`/admin/kyc/${id}/reject`, { reason }).then(r => r.data),
  getSettings: () => api.get('/admin/settings').then(r => r.data),
  updateSettings: (data) => api.put('/admin/settings', data).then(r => r.data),
  // Legal documents
  legalList: () => api.get('/admin/legal/documents').then(r => r.data),
  legalGet: (slug) => api.get(`/admin/legal/documents/${slug}`).then(r => r.data),
  legalSave: (slug, payload) => api.put(`/admin/legal/documents/${slug}`, payload).then(r => r.data),
  legalPublish: (slug) => api.post(`/admin/legal/documents/${slug}/publish`).then(r => r.data),
  legalDownloadUrl: (slug) => `${API}/admin/legal/documents/${slug}/download`,
};

export const legalAPI = {
  list: () => api.get('/legal/documents').then(r => r.data),
  get: (slug) => api.get(`/legal/documents/${slug}`).then(r => r.data),
};

export const walletAPI = {
  me: () => api.get('/wallet/me').then(r => r.data),
  transactions: (limit = 50) => api.get('/wallet/transactions', { params: { limit } }).then(r => r.data),
  topup: (amount) => api.post('/wallet/topup', { amount }).then(r => r.data),
};

export const uploadsAPI = {
  image: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/admin/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  contestImage: (file, { focal_x = 0.5, focal_y = 0.5, alt = '' } = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('focal_x', String(focal_x));
    fd.append('focal_y', String(focal_y));
    fd.append('alt', alt);
    return api.post('/admin/uploads/contest-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
};

export const paymentsAPI = {
  createTopupCheckout: (lookup_key) => api.post('/payments/wallet-topup/checkout', {
    lookup_key,
    origin_url: window.location.origin,
  }).then(r => r.data),
  createCheckoutSession: (lookup_key, origin_url) => api.post('/payments/wallet-topup/checkout', {
    lookup_key,
    origin_url: origin_url || window.location.origin,
  }).then(r => ({ url: r.data.checkout_url, session_id: r.data.session_id })),
  createCustomTopup: (amount, origin_url) => api.post('/payments/wallet-topup/custom', {
    amount,
    origin_url: origin_url || window.location.origin,
  }).then(r => ({ url: r.data.checkout_url, session_id: r.data.session_id })),
  status: (session_id) => api.get(`/payments/status/${session_id}`).then(r => r.data),
  bonusStats: () => api.get('/admin/bonus/stats').then(r => r.data),
};

export const adminWalletAPI = {
  list: () => api.get('/admin/wallets').then(r => r.data),
  adjust: (user_id, amount, note) => api.post('/admin/wallets/adjust', { user_id, amount, note }).then(r => r.data),
  userTransactions: (user_id) => api.get(`/admin/wallets/${user_id}/transactions`).then(r => r.data),
};

export const referralAPI = {
  me: () => api.get('/referrals/me').then(r => r.data),
  list: () => api.get('/referrals/list').then(r => r.data),
  complete: () => api.post('/referrals/complete').then(r => r.data),
};

export const gamesAPI = {
  types: () => api.get('/games/types').then(r => r.data),
  submit: (data) => api.post('/games/submit', data).then(r => r.data),
  myAttempts: (ticket_id) => api.get(`/games/attempts/${ticket_id}`).then(r => r.data),
  leaderboard: (contest_id, limit = 25) => api.get(`/contests/${contest_id}/leaderboard`, { params: { limit } }).then(r => r.data),
};

