import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gz_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Backend refuses gameplay/payments until mobile OTP is verified; let the UI prompt for it.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const detail = err?.response?.data?.detail;
    if (err?.response?.status === 403 && detail?.code === 'PHONE_VERIFICATION_REQUIRED') {
      window.dispatchEvent(new CustomEvent('pl:phone-required'));
    }
    return Promise.reject(err);
  },
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data).then(r => r.data),
  login: (data) => api.post('/auth/login', data).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  setSmsConsent: (sms_consent) => api.post('/auth/preferences/sms-consent', { sms_consent }).then(r => r.data),
  googleSession: (sessionId) => api.post('/auth/session', {}, { headers: { 'X-Session-ID': sessionId } }).then(r => r.data),
  emailOtpSend: (email) =>
    api.post('/auth/otp/email/send', { email }).then(r => r.data),
  otpSend: (phone) => api.post('/auth/otp/send', { phone }).then(r => r.data),
  emailOtpCheck: (email, code) => api.post('/auth/otp/email/check', { email, code }).then(r => r.data),
  otpCheck: (phone, code) => api.post('/auth/otp/check', { phone, code }).then(r => r.data),
  otpVerifyBind: (phone, code) => api.post('/auth/otp/verify-bind', { phone, code }).then(r => r.data),
  otpLoginVerify: (phone, code) => api.post('/auth/otp/login-verify', { phone, code }).then(r => r.data),
  passwordResetSend: (identifier) =>
    api.post('/auth/password-reset/send', identifier.includes('@') ? { email: identifier } : { phone: identifier }).then(r => r.data),
  passwordResetConfirm: (identifier, code, newPassword) =>
    api.post('/auth/password-reset/confirm', {
      ...(identifier.includes('@') ? { email: identifier } : { phone: identifier }),
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
  createGuest: (data) => api.post('/support/guest', data).then(r => r.data),
  mine: () => api.get('/support/mine').then(r => r.data),
  reply: (case_id, message) => api.post(`/support/${case_id}/reply`, { message }).then(r => r.data),
  config: () => api.get('/support/config').then(r => r.data),
  knowledge: () => api.get('/support/knowledge').then(r => r.data),
  aiChat: (message, history = []) => api.post('/support/ai/chat', { message, history }).then(r => r.data),
};

export const contestsAPI = {
  list: (params = {}) => api.get('/contests', { params }).then(r => r.data),
  get: (slug) => api.get(`/contests/${slug}`).then(r => r.data),
  skillChallenge: (slug) => api.get(`/contests/${slug}/skill-challenge`).then(r => r.data),
  verifySkill: (slug, answer, challenge_token) =>
    api.post(`/contests/${slug}/verify-skill`, { answer, challenge_token }).then(r => r.data),
  recentWinners: () => api.get('/public/winners').then(r => r.data),
  championWinners: () => api.get('/world/public/champion-winners').then(r => r.data),
};

export const ordersAPI = {
  checkout: (items) => api.post('/orders/checkout', { items }).then(r => r.data),
  mine: () => api.get('/orders/mine').then(r => r.data),
  myTickets: (limit = 200) => api.get(`/orders/my-tickets?limit=${limit}`).then(r => r.data),
  myGames: () => api.get('/orders/my-games').then(r => r.data),
  myJoinedContestIds: () => api.get('/orders/my-joined-contest-ids').then(r => r.data?.contest_ids || []),
};

export const publicAPI = {
  winners: () => api.get('/public/winners').then(r => r.data),
  stats: () => api.get('/public/stats').then(r => r.data),
};

export const userAPI = {
  me: () => api.get('/users/me').then(r => r.data),
  updateMe: (data) => api.patch('/users/me', data).then(r => r.data),
  changePassword: (data) => api.post('/users/me/password', data).then(r => r.data),
  setFirstPassword: (new_password) => api.post('/users/me/password/set', { new_password }).then(r => r.data),
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
  markNotificationRead: (id) => api.post(`/users/notifications/${id}/read`).then(r => r.data),
  markNotificationUnread: (id) => api.post(`/users/notifications/${id}/unread`).then(r => r.data),
  acceptTerms: () => api.post('/users/me/accept-terms').then(r => r.data),
  promotionsConsent: () => api.get('/users/me/promotions-consent').then(r => r.data),
  savePromotionsConsent: (payload) => api.put('/users/me/promotions-consent', payload).then(r => r.data),
};

export const pushAPI = {
  settings: () => api.get('/push/settings').then(r => r.data),
  registerWebSubscription: (subscription) => api.post('/push/web-subscriptions', subscription).then(r => r.data),
  updatePreferences: (payload) => api.patch('/push/preferences', payload).then(r => r.data),
  removeWebDevice: (id) => api.delete(`/push/web-subscriptions/${encodeURIComponent(id)}`).then(r => r.data),
  registerNativeDevice: (payload) => api.post('/push/native-devices', payload).then(r => r.data),
  removeNativeDevice: (id) => api.delete(`/push/native-devices/${encodeURIComponent(id)}`).then(r => r.data),
};

export const productionAPI = {
  upcomingDraws: (hours = 24) => api.get('/production/upcoming-draws', { params: { hours } }).then(r => r.data),
  draw: (contestId) => api.post(`/production/draw/${contestId}`).then(r => r.data),
};

export const adminAPI = {
  stats: () => api.get('/admin/stats').then(r => r.data),
  dashboardSummary: (period = '24h', range = {}) => api.get('/admin/dashboard/summary', { params: { period, ...range } }).then(r => r.data),
  dashboardRecentActivity: (params = {}) => api.get('/admin/dashboard/recent-activity', { params }).then(r => r.data),
  userStats: (params = {}) => api.get('/admin/dashboard/user-stats', { params }).then(r => r.data),
  businessReview: (period) => api.get('/admin/dashboard/business-review', { params: { period } }).then(r => r.data),
  walletReport: (params = {}) => api.get('/admin/dashboard/wallet-report', { params }).then(r => r.data),
  tokenAccounting: (params = {}) => api.get('/admin/dashboard/token-accounting', { params }).then(r => r.data),
  tokenLedger: (params = {}) => api.get('/admin/dashboard/token-ledger', { params }).then(r => r.data),
  tokenLedgerCsv: (params = {}) => api.get('/admin/dashboard/token-ledger.csv', { params, responseType: 'blob' }).then(r => r.data),
  worldActivity: (params = {}) => api.get('/admin/dashboard/world-activity', { params }).then(r => r.data),
  walletIntegrity: (params = {}) => api.get('/admin/dashboard/wallet-integrity', { params }).then(r => r.data),
  dashboardDetails: ({ metric, period = '24h', skip = 0, limit = 100, ...filters } = {}) => api.get('/admin/dashboard/details', { params: { metric, period, skip, limit, ...filters } }).then(r => r.data),
  users: () => api.get('/admin/users').then(r => r.data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data).then(r => r.data),
  bulkUserActions: (payload) => api.post('/admin/users/bulk-actions', payload).then(r => r.data),
  adjustUserWallet: (id, payload) => api.post(`/admin/users/${encodeURIComponent(id)}/wallet-adjust`, payload).then(r => r.data),
  disableUserWebPush: (id, reason) => api.post(`/admin/users/${encodeURIComponent(id)}/web-push/disable`, { reason }).then(r => r.data),
  enableUserWebPush: (id, evidence) => api.post(`/admin/users/${encodeURIComponent(id)}/web-push/enable`, { evidence }).then(r => r.data),
  userPromotionsConsent: (id) => api.get(`/admin/users/${encodeURIComponent(id)}/promotions-consent`).then(r => r.data),
  saveUserPromotionsConsent: (id, payload) => api.put(`/admin/users/${encodeURIComponent(id)}/promotions-consent`, payload).then(r => r.data),
  creditBonus: (payload) => api.post('/admin/bonus-grants', payload).then(r => r.data),
  bonusGrants: (params = {}) => api.get('/admin/bonus-grants', { params }).then(r => r.data),
  revokeAllBonusGrants: (reason, confirm) => api.post('/admin/bonus-grants/revoke-all', { reason, confirm }).then(r => r.data),
  revokeBonusGrant: (grantId, reason) => api.post(`/admin/bonus-grants/${encodeURIComponent(grantId)}/revoke`, { reason }).then(r => r.data),
  user360: (id) => api.get(`/admin/users/${id}/360`).then(r => r.data),
  sendUserPhoneOtp: (id) =>
    api.post(`/admin/users/${id}/phone/send-otp`).then(r => r.data),
  verifyUserPhoneOtp: (id, code) =>
    api.post(`/admin/users/${id}/phone/verify-otp`, { code }).then(r => r.data),
  sendContactVerificationLink: (id, channel) =>
    api.post(`/admin/users/${encodeURIComponent(id)}/${channel}/send-verification-link`).then(r => r.data),
  setUserSmsConsent: (id, consent) =>
    api.post(`/admin/users/${id}/sms-consent`, { consent }).then(r => r.data),
  suspendUser: (id) => api.post(`/admin/users/${id}/suspend`).then(r => r.data),
  unsuspendUser: (id) => api.post(`/admin/users/${id}/unsuspend`).then(r => r.data),
  orders: () => api.get('/admin/orders').then(r => r.data),
  refundOrder: (id) => api.post(`/admin/orders/${id}/refund`).then(r => r.data),
  payments: () => api.get('/admin/payments').then(r => r.data),
  contests: () => api.get('/admin/contests').then(r => r.data),
  leaderboardContests: () => api.get('/admin/leaderboards/contests').then(r => r.data),
  paidLeaderboard: (contestId) => api.get(`/admin/leaderboards/paid/${encodeURIComponent(contestId)}`).then(r => r.data),
  freeWorldLeaderboard: (contestNumber) => api.get(`/admin/leaderboards/free-world/${contestNumber}`).then(r => r.data),
  overridePaidLeaderboardTime: (scoreId, payload) => api.put(`/admin/leaderboards/paid/${encodeURIComponent(scoreId)}/time`, payload).then(r => r.data),
  overrideFreeWorldLeaderboardTime: (scoreId, payload) => api.put(`/admin/leaderboards/free-world/${encodeURIComponent(scoreId)}/time`, payload).then(r => r.data),
  updateContest: (id, data) => api.put(`/admin/contests/${id}`, data).then(r => r.data),
  createContest: (data) => api.post('/admin/contests', data).then(r => r.data),
  winners: () => api.get('/admin/winners').then(r => r.data),
  tickerWinners: () => api.get('/admin/world/ticker-winners').then(r => r.data),
  addTickerWinner: (data) => api.post('/admin/world/ticker-winners', data).then(r => r.data),
  deleteTickerWinner: (id) => api.delete(`/admin/world/ticker-winners/${id}`).then(r => r.data),
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
  supportSuggestions: (case_id, attempt = 0) => api.post(`/admin/support/cases/${case_id}/suggestions`, { attempt }).then(r => r.data),
  supportStatus: (case_id, status) => api.post(`/admin/support/cases/${case_id}/status`, { status }).then(r => r.data),
  supportCasesSearch: (params = {}) => api.get('/admin/support/cases', { params }).then(r => r.data),
  supportPriority: (case_id, priority) => api.post(`/admin/support/cases/${case_id}/priority`, { priority }).then(r => r.data),
  supportAssign: (case_id, admin_user_id) => api.post(`/admin/support/cases/${case_id}/assign`, { admin_user_id }).then(r => r.data),
  supportNote: (case_id, note) => api.post(`/admin/support/cases/${case_id}/notes`, { note }).then(r => r.data),
  supportKnowledge: () => api.get('/admin/support/knowledge').then(r => r.data),
  createSupportKnowledge: (data) => api.post('/admin/support/knowledge', data).then(r => r.data),
  updateSupportKnowledge: (id, data) => api.put(`/admin/support/knowledge/${id}`, data).then(r => r.data),
  deleteSupportKnowledge: (id) => api.delete(`/admin/support/knowledge/${id}`).then(r => r.data),
  wsAudit: (cid) => api.get(`/admin/winners/${cid}/audit`).then(r => r.data),

  kycList: (status = 'all') => api.get('/admin/kyc', { params: { status } }).then(r => r.data),
  kycApprove: (id) => api.post(`/admin/kyc/${id}/approve`).then(r => r.data),
  kycReject: (id, reason) => api.post(`/admin/kyc/${id}/reject`, { reason }).then(r => r.data),

  getSettings: () => api.get('/admin/settings').then(r => r.data),
  updateSettings: (data) => api.put('/admin/settings', data).then(r => r.data),
  influencers: (params = {}) => api.get('/admin/influencers', { params }).then(r => r.data),
  assignInfluencer: (payload) => api.post('/admin/influencers', payload).then(r => r.data),
  createInfluencerInvite: (payload) => api.post('/admin/influencers/invites', payload).then(r => r.data),
  updateInfluencer: (id, payload) => api.patch(`/admin/influencers/${encodeURIComponent(id)}`, payload).then(r => r.data),
  influencerCommissions: (id, params = {}) => api.get(`/admin/influencers/${encodeURIComponent(id)}/commissions`, { params }).then(r => r.data),
  exportInfluencerCommissions: (params = {}) => api.get('/admin/influencers/commissions.csv', { params, responseType: 'blob' }).then(r => r.data),
  exportInfluencerCampaigns: (params = {}) => api.get('/admin/influencers/campaigns.csv', { params, responseType: 'blob' }).then(r => r.data),
  reviewInfluencerCommission: (id, commissionId, payload) => api.post(`/admin/influencers/${encodeURIComponent(id)}/commissions/${encodeURIComponent(commissionId)}/review`, payload).then(r => r.data),
  recordInfluencerPayment: (id, commissionId, payload) => api.post(`/admin/influencers/${encodeURIComponent(id)}/commissions/${encodeURIComponent(commissionId)}/record-payment`, payload).then(r => r.data),
  influencerPromos: () => api.get('/admin/influencer-promos').then(r => r.data),
  createInfluencerPromo: (payload) => api.post('/admin/influencer-promos', payload).then(r => r.data),
  updateInfluencerPromo: (id, payload) => api.put(`/admin/influencer-promos/${encodeURIComponent(id)}`, payload).then(r => r.data),

  // Admin alerts
  alertCampaigns: (limit = 50) =>
    api.get('/admin/users/alerts/campaigns', { params: { limit } }).then(r => r.data),

  createAlertCampaign: (data) =>
    api.post('/admin/users/alerts/campaigns', data).then(r => r.data),

  alertCampaign: (campaignId) =>
    api.get(`/admin/users/alerts/campaigns/${campaignId}`).then(r => r.data),

  alertDeliveries: (campaignId, params = {}) =>
    api.get(`/admin/users/alerts/campaigns/${campaignId}/deliveries`, { params }).then(r => r.data),

  alertUserSearch: (q) =>
    api.get('/admin/users/alerts/user-search', { params: { q } }).then(r => r.data),

  alertWinnerSources: () =>
    api.get('/admin/users/alerts/winner-sources').then(r => r.data),

  alertWinners: (source, ref = 'all') =>
    api.get('/admin/users/alerts/winners', { params: { source, ref } }).then(r => r.data),

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

export const influencerAPI = {
  dashboard: (params = {}) => api.get('/influencer/dashboard', { params }).then(r => r.data),
  commissionsCsv: () => api.get('/influencer/commissions.csv', { responseType: 'blob' }).then(r => r.data),
  recordVisit: (payload) => api.post('/influencer/visit', payload).then(r => r.data),
};

export const walletAPI = {
  me: () => api.get('/wallet/me').then(r => r.data),
  transactions: (limit = 50) => api.get('/wallet/transactions', { params: { limit } }).then(r => r.data),
};

export const cashoutAPI = {
  config: () => api.get('/cashout/config').then(r => r.data),
  summary: () => api.get('/cashout/summary').then(r => r.data),
  banks: () => api.get('/cashout/bank-accounts').then(r => r.data),
  addBank: (data) => api.post('/cashout/bank-accounts', data).then(r => r.data),
  request: (data) => api.post('/cashout/request', data).then(r => r.data),
  myRequests: () => api.get('/cashout/requests').then(r => r.data),
  uploadReviewProof: (platform, file) => { const fd = new FormData(); fd.append('platform', platform); fd.append('file', file); return api.post('/cashout/review-proof', fd).then(r => r.data); },
  adminReviews: () => api.get('/admin/cashout/reviews').then(r => r.data),
  adminReviewImage: (id) => api.get(`/admin/cashout/reviews/${id}/image`, { responseType: 'blob' }).then(r => r.data),
  adminReviewDecision: (id, decision, note = '') => api.post(`/admin/cashout/reviews/${id}/decision`, { decision, note }).then(r => r.data),
  adminGrantBypass: (data) => api.post('/admin/cashout/review-bypass', data).then(r => r.data),
  // admin
  adminConfig: () => api.get('/admin/cashout/config').then(r => r.data),
  adminUpdateConfig: (data) => api.put('/admin/cashout/config', data).then(r => r.data),
  adminList: (status) => api.get('/admin/cashout/withdrawals', { params: status ? { status } : {} }).then(r => r.data),
  adminDetail: (id) => api.get(`/admin/cashout/withdrawals/${id}`).then(r => r.data),
  adminMarkPaid: (id, notification_message) =>
  api
    .post(`/admin/cashout/withdrawals/${id}/mark-paid`, {
      notification_message,
    })
    .then((r) => r.data),

adminReject: (id, reason, notification_message) =>
  api
    .post(`/admin/cashout/withdrawals/${id}/reject`, {
      reason,
      notification_message,
    })
    .then((r) => r.data),
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

    return api.post('/admin/uploads/contest-image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
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
  }).then(r => ({
    url: r.data.checkout_url,
    session_id: r.data.session_id,
  })),

  createCustomTopup: (amount, origin_url) => api.post('/payments/wallet-topup/custom', {
    amount,
    origin_url: origin_url || window.location.origin,
  }).then(r => ({
    url: r.data.checkout_url,
    session_id: r.data.session_id,
  })),

  status: (session_id) =>
    api.get(`/payments/status/${session_id}`).then(r => r.data),
};

export const adminWalletAPI = {
  list: () => api.get('/admin/wallets').then(r => r.data),
  adjust: (user_id, amount, note) =>
    api.post('/admin/wallets/adjust', {
      user_id,
      amount,
      note,
    }).then(r => r.data),

  userTransactions: (user_id) =>
    api.get(`/admin/wallets/${user_id}/transactions`).then(r => r.data),
};

export const referralAPI = {
  me: () => api.get('/referrals/me').then(r => r.data),
  list: () => api.get('/referrals/list').then(r => r.data),
  complete: () => api.post('/referrals/complete').then(r => r.data),
};

export const offersAPI = {
  active: () => api.get('/offers/active').then(r => r.data),
  promo: (code) => api.get(`/offers/promo/${encodeURIComponent(code)}`).then(r => r.data),
  config: () => api.get('/admin/offers/config').then(r => r.data),
  saveConfig: (payload) => api.put('/admin/offers/config', payload).then(r => r.data),
  pricing: () => api.get('/admin/offers/pricing').then(r => r.data),
  preview: (amounts) => api.get('/admin/offers/preview', { params: amounts ? { amounts: amounts.join(',') } : {} }).then(r => r.data),
  promotionPreview: (promoId = '', amounts) => api.get('/admin/offers/promotion-preview', { params: { promo_id: promoId, ...(amounts ? { amounts: amounts.join(',') } : {}) } }).then(r => r.data),
  history: () => api.get('/admin/offers/history').then(r => r.data),
  referrals: (state = '') => api.get('/admin/offers/referrals', { params: state ? { state } : {} }).then(r => r.data),
  rewardHistory: (source = '') => api.get('/admin/offers/reward-history', { params: source ? { source } : {} }).then(r => r.data),
  promotionEligibility: (q = '', conflictsOnly = false) => api.get('/admin/offers/promotion-eligibility', { params: { q, conflicts_only: conflictsOnly, limit: 100 } }).then(r => r.data),
};

export const worldContestAPI = {
  championStatus: () =>
    api.get(
      '/world/champion/status',
    ).then(r => r.data),

  reserveChampionTokenRetry: () =>
    api.post(
      '/world/token/retry/reserve',
      { level: 0 },
    ).then(r => r.data),

  startChampionSession: () =>
    api.post(
      '/world/champion/session/start',
      {},
    ).then(r => r.data),

  beginChampionSession: (session_id) =>
    api.post(
      '/world/champion/session/begin',
      { session_id },
    ).then(r => r.data),

  submitChampionSession: ({
    session_id,
    duration_ms,
    solved,
    taps,
  }) =>
    api.post(
      '/world/champion/session/submit',
      {
        session_id,
        duration_ms,
        solved,
        taps,
      },
    ).then(r => r.data),

  myChampionHistory: () =>
    api.get(
      '/world/champion/me',
    ).then(r => r.data),

  active: () =>
    api.get('/world/active-contest').then(r => r.data),

  me: () =>
    api.get('/world/contest/me').then(r => r.data),

  enter: () =>
    api.post('/world/contest/enter').then(r => r.data),

  leaderboard: (contestNumber, limit = 100) =>
    api.get(
      '/world/public/leaderboard',
      {
        params: {
          ...(contestNumber
            ? { contest_number: contestNumber }
            : {}),
          limit,
        },
      },
    ).then(r => r.data),
};

export const worldGcCompetitionAPI = {
  activeModel: () => api.get('/world/gc/active-model').then(r => r.data),
  pauseStatus: () => api.get('/world/pause-status').then(r => r.data),
  progress: (gcNumber) => api.get(`/world/gc/progress/${gcNumber}`).then(r => r.data),
  startMemoryMatch: (gcNumber, level) =>
    api.post('/world/gc/memory-match/session/start', { gc_number: gcNumber, level }).then(r => r.data),
  beginMemoryMatch: (sessionId) =>
    api.post(`/world/gc/memory-match/session/${encodeURIComponent(sessionId)}/begin`).then(r => r.data),
  clickMemoryMatch: (sessionId, position) =>
    api.post(`/world/gc/memory-match/session/${encodeURIComponent(sessionId)}/click`, { position }).then(r => r.data),
  leaderboard: (gcNumber, level) =>
    api.get(`/world/gc/leaderboard/${gcNumber}/${encodeURIComponent(level)}`).then(r => r.data),
  levelBoard: (gcNumber, level) => api.get(`/world/gc/level-board/${gcNumber}/${level}`).then(r => r.data),
};

export const worldAdminAPI = {
  seed: () =>
    api.post('/admin/world/seed').then(r => r.data),

  contests: () =>
    api.get('/admin/world/contests').then(r => r.data),

  contest: (number) =>
    api.get(`/admin/world/contests/${number}`).then(r => r.data),

  updateContest: (number, data) =>
    api.put(`/admin/world/contests/${number}`, data).then(r => r.data),

  activate: (data) =>
    api.post('/admin/world/activate', data).then(r => r.data),

  deactivate: () =>
    api.post('/admin/world/deactivate').then(r => r.data),

  championPrizes: () =>
    api.get('/admin/world/champion-prizes').then(r => r.data),

  updateChampionPrize: (stage, data) =>
    api.put(
      `/admin/world/champion-prizes/${stage}`,
      data,
    ).then(r => r.data),

  entries: ({
    contest_number,
    limit = 200,
  } = {}) =>
    api.get(
      '/admin/world/entries',
      {
        params: {
          ...(contest_number
            ? {
                contest_number,
              }
            : {}),
          limit,
        },
      },
    ).then(r => r.data),

  seasonSchedule: (previewStart) =>
    api.get('/admin/world/season-schedule', {
      params: previewStart ? { preview_start: previewStart } : {},
    }).then(r => r.data),

  users: (params = {}) =>
    api.get('/admin/world/users', { params }).then(r => r.data),

  userProgress: (userId) =>
    api.get(`/admin/world/user-progress/${userId}`).then(r => r.data),

  editUserProgress: (userId, data) =>
    api.post(`/admin/world/user-progress/${userId}`, data).then(r => r.data),

  extendContest: (number, days = 1) =>
    api.post(`/admin/world/contest/${number}/extend`, null, {
      params: { days },
    }).then(r => r.data),

  resetExtensions: () =>
    api.post('/admin/world/contest-extensions/reset').then(r => r.data),

  stageLevelConfig: () =>
    api.get('/admin/world/stage-level-config').then(r => r.data),

  setStageLevelConfig: (data) =>
    api.put('/admin/world/stage-level-config', data).then(r => r.data),
};

export const drawStudioAPI = {
  contests: () => api.get('/admin/draw-studio/contests').then(r => r.data),
  pool: (contestId) => api.get(`/admin/draw-studio/contests/${contestId}/pool`).then(r => r.data),
  plans: (contestId) => api.get('/admin/draw-studio/plans', { params: { contest_id: contestId } }).then(r => r.data),
  plan: (planId) => api.get(`/admin/draw-studio/plans/${planId}`).then(r => r.data),
  createPlan: (body) => api.post('/admin/draw-studio/plans', body).then(r => r.data),
  updatePlan: (planId, body) => api.put(`/admin/draw-studio/plans/${planId}`, body).then(r => r.data),
  lock: (planId) => api.post(`/admin/draw-studio/plans/${planId}/lock`, { confirmation: 'LOCK DRAW' }).then(r => r.data),
  drawRound: (planId, index) => api.post(`/admin/draw-studio/plans/${planId}/rounds/${index}/draw`, { confirmation: `DRAW ROUND ${index + 1}` }).then(r => r.data),
  announce: (planId, index) => api.post(`/admin/draw-studio/plans/${planId}/rounds/${index}/announce`).then(r => r.data),
  report: (planId) => api.get(`/admin/draw-studio/plans/${planId}/report`).then(r => r.data),
  audio: () => api.get('/admin/draw-studio/audio').then(r => r.data),
  uploadAudio: (slot, file) => { const fd = new FormData(); fd.append('file', file); return api.post(`/admin/draw-studio/audio/${slot}`, fd).then(r => r.data); },
  audioBlob: (slot) => api.get(`/admin/draw-studio/audio/${slot}/file`, { responseType: 'blob' }).then(r => r.data),
  markRevealed: (planId, index) => api.post(`/admin/draw-studio/plans/${planId}/rounds/${index}/revealed`).then(r => r.data),
  announceAll: (planId) => api.post(`/admin/draw-studio/plans/${planId}/announce-all`).then(r => r.data),
  allPlans: () => api.get('/admin/draw-studio/plans').then(r => r.data),
  winners: (params) => api.get('/admin/draw-studio/winners', { params }).then(r => r.data),
  editWinner: (id, body) => api.patch(`/admin/draw-studio/winners/${id}`, body).then(r => r.data),
  approveWinner: (id) => api.post(`/admin/draw-studio/winners/${id}/approve`).then(r => r.data),
  winnerAudit: (id) => api.get(`/admin/draw-studio/winners/${id}/audit`).then(r => r.data),
  settings: () => api.get('/admin/draw-studio/settings').then(r => r.data),
  saveSettings: (body) => api.put('/admin/draw-studio/settings', body).then(r => r.data),
  backdrops: () => api.get('/admin/draw-studio/backdrops').then(r => r.data),
  backdropImage: (url) => api.get('/admin/draw-studio/backdrops/image', { params: { url }, responseType: 'blob' }).then(r => r.data),
  recordings: (contestId) => api.get('/admin/draw-studio/recordings', { params: { contest_id: contestId } }).then(r => r.data),
  recordingBlob: (id) => api.get(`/admin/draw-studio/recordings/${id}/file`, { responseType: 'blob' }).then(r => r.data),
  async saveRecording(blob, meta) {
    const init = await api.post('/admin/draw-studio/recordings', { ...meta, content_type: blob.type || 'video/webm', size: blob.size }).then(r => r.data);
    const chunks = Math.ceil(blob.size / init.chunk_size);
    for (let i = 0; i < chunks; i += 1) {
      await api.put(`/admin/draw-studio/recordings/${init.recording_id}/chunks/${i}`, blob.slice(i * init.chunk_size, (i + 1) * init.chunk_size), { headers: { 'Content-Type': 'application/octet-stream' } });
      meta.onProgress?.((i + 1) / chunks);
    }
    return api.post(`/admin/draw-studio/recordings/${init.recording_id}/complete`, { chunks }).then(r => r.data);
  },
};
export const contestWinnersAPI = () => api.get('/public/contest-winners').then(r => r.data);
export const contestWinnerMediaBlob = (rid) => api.get(`/contest-winners/media/${rid}`, { responseType: 'blob' }).then(r => r.data);
export const adminWinnersAllAPI = {
  list: (world) => api.get('/admin/winners-all', { params: { world } }).then(r => r.data),
  adjust: (body) => api.post('/admin/winners-all/adjust', body).then(r => r.data),
};
export const paidWinnersAPI = {
  winners: (params) => api.get('/admin/paid-winners/winners', { params }).then(r => r.data),
  approve: (id, wallet) => api.post(`/admin/paid-winners/winners/${id}/approve`, { wallet }).then(r => r.data),
  setWinnerVisible: (id, visible) => api.put(`/admin/paid-winners/winners/${id}/visibility`, { visible }).then(r => r.data),
  contests: () => api.get('/admin/paid-winners/contests').then(r => r.data),
  setPublication: (cid, body) => api.put(`/admin/paid-winners/contests/${cid}/publication`, body).then(r => r.data),
  upload: (cid, kind, file, caption = '', onProgress) => { const fd = new FormData(); fd.append('kind', kind); fd.append('caption', caption); fd.append('file', file); return api.post(`/admin/paid-winners/contests/${cid}/media`, fd, { onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : 0) }).then(r => r.data); },
  reorder: (cid, ids) => api.put(`/admin/paid-winners/contests/${cid}/media/order`, { media_ids: ids }).then(r => r.data),
  removeMedia: (cid, mid) => api.delete(`/admin/paid-winners/contests/${cid}/media/${mid}`).then(r => r.data),
  setRoundMediaVisible: (cid, rid, visible) => api.put(`/admin/paid-winners/contests/${cid}/round-media/${rid}/visibility`, { visible }).then(r => r.data),
  list: (tab) => api.get('/public/paid-winners', { params: { tab } }).then(r => r.data),
  contestWinners: (cid) => api.get(`/public/paid-winners/${cid}/winners`).then(r => r.data),
  leaderboard: (cid) => api.get(`/public/paid-winners/${cid}/leaderboard`).then(r => r.data),
  gallery: (cid) => api.get(`/public/paid-winners/${cid}/gallery`).then(r => r.data),
  mediaUrl: (cid, mid) => `${API}/public/paid-winners/media/${cid}/${mid}`,
  roundMediaUrl: (cid, rid) => `${API}/public/paid-winners/round-media/${cid}/${rid}`,
  adminMediaBlob: (cid, mid) => api.get(`/admin/paid-winners/media/${cid}/${mid}`, { responseType: 'blob' }).then(r => r.data),
};



export const worldGcCompetitionAdminAPI = {
  list: () => api.get('/admin/world-gc/competitions').then(r => r.data),
  get: (gcNumber) => api.get(`/admin/world-gc/competitions/${gcNumber}`).then(r => r.data),
  saveDraft: (gcNumber, config) =>
    api.put(`/admin/world-gc/competitions/${gcNumber}`, config).then(r => r.data),
  schedule: (gcNumber, confirmation) =>
    api.post(`/admin/world-gc/competitions/${gcNumber}/schedule`, { confirmation }).then(r => r.data),
  activate: (gcNumber, confirmation) =>
    api.post(`/admin/world-gc/competitions/${gcNumber}/activate`, { confirmation }).then(r => r.data),
  report: (gcNumber, level) =>
    api.get(`/admin/world-gc/competitions/${gcNumber}/report/${encodeURIComponent(level)}`).then(r => r.data),
  applyCurrent: (gcNumber) =>
    api.post(`/admin/world-gc/competitions/${gcNumber}/apply-current`, { confirmation: `APPLY GC${gcNumber}` }).then(r => r.data),
  applyFuture: (gcNumber) =>
    api.post(`/admin/world-gc/competitions/${gcNumber}/apply-future`, { confirmation: `APPLY GC${gcNumber} FUTURE` }).then(r => r.data),
  pauseStatus: () => api.get('/admin/world-gc/free-world/pause').then(r => r.data),
  pause: (reason) => api.post('/admin/world-gc/free-world/pause', { reason }).then(r => r.data),
  resume: (body = {}) => api.post('/admin/world-gc/free-world/resume', body).then(r => r.data),
  previewGet: () => api.get('/admin/world-gc/preview').then(r => r.data),
  previewReset: (gcNumber) => api.post('/admin/world-gc/preview/reset', { gc_number: gcNumber }).then(r => r.data),
  previewAction: (body) => api.post('/admin/world-gc/preview/action', body).then(r => r.data),
};

export const worldAPI = {
  state: () =>
    api.get('/world/state').then(r => r.data),

  level: (level) =>
    api.get(`/world/level/${level}`).then(r => r.data),

  access: () =>
    api.get(
      '/world/access',
    ).then(r => r.data),

  startSession: (level) =>
    api.post(
      '/world/session/start',
      { level },
    ).then(r => r.data),

  beginSession: (session_id) =>
    api.post(
      '/world/session/begin',
      { session_id },
    ).then(r => r.data),

  submitSession: ({
    session_id,
    duration_ms,
    solved,
    taps,
  }) =>
    api.post(
      '/world/session/submit',
      {
        session_id,
        duration_ms,
        solved,
        taps,
      },
    ).then(r => r.data),

  attemptSummary: (level) =>
    api.get(
      `/world/attempts/${level}`,
    ).then(r => r.data),

  reserveTokenRetry: (level) =>
    api.post(
      '/world/token/retry/reserve',
      { level },
    ).then(r => r.data),

  reserveTokenUnlock: (level) =>
    api.post(
      '/world/token/unlock/reserve',
      { level },
    ).then(r => r.data),

  championLeaderboard: (contestNumber) =>
    api.get(
      '/world/public/champion/leaderboard',
      {
        params: contestNumber
          ? {
              contest_number:
                contestNumber,
            }
          : {},
      },
    ).then(r => r.data),

};

export const gamesAPI = {
  types: () => api.get('/games/types').then(r => r.data),

  start: (data) => api.post('/games/session/start', data).then(r => r.data),

  submit: (data) =>
    api.post('/games/submit', data).then(r => r.data),

  myAttempts: (ticket_id) =>
    api.get(`/games/attempts/${ticket_id}`).then(r => r.data),

  leaderboard: (contest_id, limit = 25) =>
    api.get(`/contests/${contest_id}/leaderboard`, {
      params: { limit },
    }).then(r => r.data),
};

export const winningsAPI = {
  challengeGames: () =>
    api.get('/winnings/challenge/games').then(r => r.data),

  challengeAttempts: () =>
    api.get('/winnings/challenge/attempts').then(r => r.data),

  startChallenge: () =>
    api.post('/winnings/challenge/start').then(r => r.data),

  completeChallenge: (attempt_id, sequence) =>
    api.post('/winnings/challenge/complete', {
      attempt_id,
      sequence,
    }).then(r => r.data),

  wallet: () =>
    api.get('/winnings/wallet').then(r => r.data),

  ledger: () =>
    api.get('/winnings/ledger').then(r => r.data),

  withdraw: (payload) =>
    api.post('/winnings/withdraw', payload).then(r => r.data),

  myWithdrawals: () =>
    api.get('/winnings/withdrawals').then(r => r.data),
};

export const winningsAdminAPI = {
  list: (status) =>
    api.get('/admin/winnings/withdrawals', {
      params: status ? { status } : {},
    }).then(r => r.data),

  bank: (id) =>
    api.get(`/admin/winnings/withdrawals/${id}/bank`).then(r => r.data),

  markPaid: (id) =>
    api.post(`/admin/winnings/withdrawals/${id}/mark-paid`).then(r => r.data),

  reject: (id, reason) =>
    api.post(`/admin/winnings/withdrawals/${id}/reject`, {
      reason,
    }).then(r => r.data),
};


export const acquisitionAPI = {
  track: (payload) =>
    api.post('/acquisition/track', payload).then(r => r.data),
  pageView: (payload) =>
    api.post('/acquisition/page-view', payload).then(r => r.data),
  event: (payload) =>
    api.post('/acquisition/event', payload).then(r => r.data),
  paidGameStart: (payload) =>
    api.post('/acquisition/game-start', payload).then(r => r.data),
  attribute: (payload) =>
    api.post('/acquisition/attribute', payload).then(r => r.data),
  // keepalive lets the request finish while the page is closing.
  engagement: (payload) => {
    try {
      fetch(`${API}/acquisition/engagement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } catch (e) { /* tracking must never break the page */ }
  },
};

export const acquisitionAdminAPI = {
  summary: (period = '1m') =>
    api.get('/admin/acquisition/summary', {
      params: { period },
    }).then(r => r.data),

  visits: ({ period = '1m', source, skip = 0, limit = 50 } = {}) =>
    api.get('/admin/acquisition/visits', {
      params: { period, source, skip, limit },
    }).then(r => r.data),
  pageViews: ({ period = '1m', skip = 0, limit = 100 } = {}) =>
    api.get('/admin/acquisition/page-views', { params: { period, skip, limit } }).then(r => r.data),
  // report: overview | sources | pages | funnel | journeys | events
  analytics: (report, params = {}) =>
    api.get(`/admin/acquisition/analytics/${report}`, { params }).then(r => r.data),
  exportCsv: (report, params = {}) =>
    api.get('/admin/acquisition/analytics/export', { params: { report, ...params }, responseType: 'blob' }).then(r => r.data),
};

export const promotionCampaignAPI = {
  list: () => api.get('/promotion/campaigns').then(r => r.data),
  claim: (promotionId) => api.post(`/promotion/campaigns/${encodeURIComponent(promotionId)}/claim`).then(r => r.data),
  adminList: () => api.get('/admin/promotion/campaigns').then(r => r.data),
  create: (payload) => api.post('/admin/promotion/campaigns', payload).then(r => r.data),
  update: (promotionId, payload) => api.put(`/admin/promotion/campaigns/${encodeURIComponent(promotionId)}`, payload).then(r => r.data),
  drawStatus: (promotionId) => api.get('/admin/promotion/draw', { params: promotionId ? { promotion_id: promotionId } : {} }).then(r => r.data),
  runDraw: (promotionId) => api.post('/admin/promotion/draw', null, { params: promotionId ? { promotion_id: promotionId } : {} }).then(r => r.data),
  verifyWinner: (promotionId, place) => api.post(`/admin/promotion/draw/winners/${place}/verify`, null, { params: promotionId ? { promotion_id: promotionId } : {} }).then(r => r.data),
  payWinner: (promotionId, place) => api.post(`/admin/promotion/draw/winners/${place}/paid`, null, { params: promotionId ? { promotion_id: promotionId } : {} }).then(r => r.data),
};

export const announcementsAdminAPI = {
  list: () => api.get('/admin/announcements').then(r => r.data),
  generated: () => api.get('/admin/announcements/generated').then(r => r.data),
  updateGenerated: (id, body) => api.put(`/admin/announcements/generated/${encodeURIComponent(id)}`, body).then(r => r.data),
  badgeSettings: () => api.get('/admin/announcements/promotion-badge').then(r => r.data),
  saveBadgeSettings: (body) => api.put('/admin/announcements/promotion-badge', body).then(r => r.data),
  create: (body) => api.post('/admin/announcements', body).then(r => r.data),
  update: (id, body) => api.put(`/admin/announcements/${id}`, body).then(r => r.data),
  action: (id, action) => api.post(`/admin/announcements/${id}/${action}`).then(r => r.data),
  remove: (id) => api.delete(`/admin/announcements/${id}`).then(r => r.data),
  reorder: (ids) => api.post('/admin/announcements/reorder', { ids }).then(r => r.data),
  audit: () => api.get('/admin/announcements/audit').then(r => r.data),
};
