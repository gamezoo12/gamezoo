let active = null;

function browserName(userAgent) {
  if (/Edg\//.test(userAgent)) return 'Edge';
  if (/Chrome\//.test(userAgent) && !/Chromium/.test(userAgent)) return 'Chrome';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return 'Safari';
  return 'Other';
}

function onInput(event) {
  if (!active) return;
  const now = performance.now();
  if (active.lastInputAt != null) active.intervals.push(Math.max(0, Math.round(now - active.lastInputAt)));
  active.lastInputAt = now;
  active.actionCount += 1;
  active.sources.add(event.type);
  if (event.isTrusted === false) active.zeroTrustEvents += 1;
}

function onVisibility() {
  if (active) active.visibilityChanges += 1;
}

export function startGameplayTelemetry(attemptId) {
  if (active) stopGameplayTelemetry();
  active = {
    attemptId,
    startedAt: performance.now(),
    lastInputAt: null,
    intervals: [],
    actionCount: 0,
    zeroTrustEvents: 0,
    visibilityChanges: 0,
    sources: new Set(),
  };
  document.addEventListener('pointerdown', onInput, true);
  document.addEventListener('keydown', onInput, true);
  document.addEventListener('visibilitychange', onVisibility, true);
}

export function stopGameplayTelemetry() {
  document.removeEventListener('pointerdown', onInput, true);
  document.removeEventListener('keydown', onInput, true);
  document.removeEventListener('visibilitychange', onVisibility, true);
  active = null;
}

export function gameplayTelemetrySnapshot() {
  if (!active) return {};
  const userAgent = navigator.userAgent || '';
  const automationLabels = [];
  if (navigator.webdriver) automationLabels.push('navigator.webdriver');
  if (navigator.plugins?.length === 0) automationLabels.push('no_browser_plugins');
  if (window.callPhantom) automationLabels.push('phantomjs');
  if (window._phantom) automationLabels.push('phantom');
  if (window.__nightmare) automationLabels.push('nightmare');
  if (window.domAutomation || window.domAutomationController) automationLabels.push('dom_automation');
  return {
    attempt_id: active.attemptId,
    user_agent: userAgent,
    browser_name: browserName(userAgent),
    platform: navigator.platform || '',
    language: navigator.language || '',
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    webdriver: Boolean(navigator.webdriver),
    visibility_changes: active.visibilityChanges,
    zero_trust_events: active.zeroTrustEvents,
    action_count: active.actionCount,
    input_intervals_ms: active.intervals.slice(-1000),
    input_sources: [...active.sources],
    automation_labels: automationLabels,
    client_elapsed_ms: Math.round(performance.now() - active.startedAt),
  };
}
