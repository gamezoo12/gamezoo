// FastAPI returns `detail` as a string or, for validation errors, an array of objects.
export function apiErrorMessage(error, fallback = 'Request failed. Please try again.') {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const text = typeof first === 'string' ? first : first?.msg;
    if (text) return String(text);
  }
  return fallback;
}
