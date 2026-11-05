// Init script: tracks <audio> music playback + AudioBufferSource starts for the arcade audit.
window.__music = []; window.__bufStarts = 0;
(function () {
  const P = HTMLMediaElement.prototype; const op = P.play; const opa = P.pause;
  P.play = function () { window.__music.push({ ev: 'play', src: this.src, t: Date.now() }); window.__lastAudio = this; return op.apply(this, arguments); };
  P.pause = function () { window.__music.push({ ev: 'pause', src: this.src, t: Date.now() }); return opa.apply(this, arguments); };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) { const ocs = AC.prototype.createBufferSource; AC.prototype.createBufferSource = function () { const s = ocs.apply(this, arguments); const st = s.start; s.start = function () { window.__bufStarts += 1; return st.apply(this, arguments); }; return s; }; }
}());
