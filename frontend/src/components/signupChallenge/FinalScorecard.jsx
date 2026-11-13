import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, Instagram, Link2, MessageCircle, Share2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { signupChallengeAPI } from '../../lib/api';
import { downloadBlob, renderScorecard } from './scorecard';
import { tm } from './parts';

const track = (type, preview) => { if (!preview) signupChallengeAPI.event(type); };

async function copy(text, type, preview, label) {
  try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); } catch { toast.error('Copy is not available on this browser'); }
  track(type, preview);
}

function Btn({ icon: Icon, children, onClick, testId, gold }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={`sc-btn flex items-center justify-center gap-2 px-3 text-sm ${gold ? 'sc-btn-gold' : 'sc-btn-ghost'}`}>
      <Icon className="h-4 w-4" />{children}
    </button>
  );
}

export function FinalScorecard({ state, partial, preview, onFinish }) {
  const ch = state.challenge;
  const p = state.participation;
  const [img, setImg] = useState(null);
  const link = shareLink(ch, p);
  const message = shareMessage(ch, tm(p.best_score), link, 'My best time');
  const card = useMemo(() => ({
    title: ch.title, prize: ch.prize_label, name: p.display_name || 'Player', game: ch.game_label, url: link, bgUrl: ch.scorecard_bg_url,
    best: tm(p.best_score), partial,
    attempts: state.attempts.map((a) => ({ no: a.attempt_no, label: a.status === 'completed' ? tm(a.score) : a.status.toUpperCase(), best: a.attempt_id === p.best_attempt_id })),
  }), [ch, p, state.attempts, partial, link]);

  useEffect(() => {
    let url;
    renderScorecard(card, 'story').then((b) => { if (b) { url = URL.createObjectURL(b); setImg(url); } });
    track('final_view', preview);
    return () => url && URL.revokeObjectURL(url);
  }, [card, preview]);

  const { save, whatsapp, instagram, igHelp } = useScorecardShare(card, message, preview);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 md:flex-row md:items-start" data-testid="sc-final-scorecard">
      <div className="sc-rise mx-auto w-full max-w-[300px] shrink-0 overflow-hidden rounded-3xl border border-amber-300/40 bg-black/30 shadow-2xl md:mx-0" style={{ aspectRatio: '9 / 16' }}>
        {img ? <img src={img} alt="Your Prize League scorecard" className="h-full w-full object-cover" data-testid="sc-scorecard-image" /> : <div className="h-full w-full animate-pulse bg-white/5" />}
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-200">{partial ? 'Partial results' : 'Challenge complete'}</p>
        <h2 className="sc-gold text-4xl font-black" data-testid="sc-final-best">BEST TIME: {tm(p.best_score)}</h2>
        <p className="text-sm text-white/70">{partial ? 'You left the challenge early. Your completed attempts are saved and still count.' : `All ${ch.attempts_allowed} attempts complete. Times are verified by Prize League.`}</p>
        <div className="grid grid-cols-2 gap-2">
          <Btn icon={Download} gold onClick={() => save('story')} testId="sc-save-scorecard">Save Scorecard</Btn>
          <Btn icon={Download} onClick={() => save('square')} testId="sc-save-square">Save Square</Btn>
          <Btn icon={MessageCircle} onClick={whatsapp} testId="sc-share-whatsapp">Share to WhatsApp</Btn>
          <Btn icon={Instagram} onClick={instagram} testId="sc-share-instagram">Share to Instagram</Btn>
          <Btn icon={Link2} onClick={() => copy(link, 'copy_link', preview, 'Challenge link')} testId="sc-copy-link">Copy Challenge Link</Btn>
          <Btn icon={Copy} onClick={() => copy(message, 'copy_caption', preview, 'Caption')} testId="sc-copy-caption">Copy Caption</Btn>
          {ch.whatsapp_url && <Btn icon={Users} onClick={() => { track('community_whatsapp', preview); window.open(ch.whatsapp_url, '_blank', 'noopener'); }} testId="sc-join-whatsapp">Join WhatsApp Community</Btn>}
          {ch.instagram_url && <Btn icon={Share2} onClick={() => { track('instagram_page', preview); window.open(ch.instagram_url, '_blank', 'noopener'); }} testId="sc-open-instagram">Open Our Instagram</Btn>}
        </div>
        {igHelp && <IgHelp />}
        <button type="button" className="sc-btn sc-btn-gold mt-2" onClick={onFinish} data-testid="sc-finish-button">FINISH</button>
        <p className="text-[11px] text-white/45">Sharing is optional and never changes your score or eligibility.</p>
      </div>
    </div>
  );
}

const shareLink = (ch, p) => `${(ch.share_url || 'https://www.prizeleague.co.uk').replace(/\/$/, '')}/?sc=${p.share_code || ''}`;
const shareMessage = (ch, time, link, label) => `🏆 I just played the Prize League ${titleCase(ch.title)}!\n⏱️ ${label}: ${time}\n💷 ${ch.prize_label}!\nThink you can beat my time?\nJoin here: ${link}`;

function IgHelp() {
  return (
    <p className="rounded-2xl border border-pink-300/30 bg-pink-500/10 p-3 text-sm text-pink-50" data-testid="sc-instagram-help">
      Your story image has been saved. Open Instagram, tap + then Story, and choose the saved Prize League scorecard from your photos. Nothing is posted automatically.
    </p>
  );
}

function useScorecardShare(card, message, preview, tag = 'scorecard') {
  const [igHelp, setIgHelp] = useState(false);
  const save = async (format) => {
    const b = await renderScorecard(card, format);
    downloadBlob(b, `prize-league-${tag}-${format}.png`);
    track(`scorecard_download_${format}`, preview);
    toast.success('Scorecard saved');
  };
  const nativeShare = async (format) => {
    const b = await renderScorecard(card, format);
    const file = new File([b], `prize-league-${tag}-${format}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text: message }); track('share_native', preview); } catch { /* user cancelled */ }
      return true;
    }
    return false;
  };
  const whatsapp = async () => {
    track('share_whatsapp', preview);
    if (await nativeShare('square')) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    toast.message('Tip: save the scorecard first, then attach it in WhatsApp.');
  };
  const instagram = async () => {
    track('share_instagram', preview);
    if (await nativeShare('story')) return;
    await save('story');
    setIgHelp(true);
  };
  return { save, whatsapp, instagram, igHelp };
}

// Auto-generated scorecard + share buttons for a single completed attempt.
export function AttemptShare({ state, attempt, preview }) {
  const ch = state.challenge;
  const p = state.participation;
  const link = shareLink(ch, p);
  const time = tm(attempt.score);
  const card = useMemo(() => ({
    title: ch.title, prize: ch.prize_label, name: p.display_name || 'Player', game: ch.game_label, url: link, bgUrl: ch.scorecard_bg_url,
    headline: `ATTEMPT ${attempt.attempt_no} TIME`, best: time, partial: false,
    attempts: state.attempts.filter((a) => a.attempt_no <= attempt.attempt_no)
      .map((a) => ({ no: a.attempt_no, label: a.status === 'completed' ? tm(a.score) : a.status.toUpperCase(), best: a.attempt_id === attempt.attempt_id })),
  }), [ch, p, state.attempts, attempt, link, time]);
  const message = shareMessage(ch, time, link, `My attempt ${attempt.attempt_no} time`);
  const { save, whatsapp, instagram, igHelp } = useScorecardShare(card, message, preview, `attempt-${attempt.attempt_no}`);
  const [img, setImg] = useState(null);
  useEffect(() => {
    let url;
    renderScorecard(card, 'square').then((b) => { if (b) { url = URL.createObjectURL(b); setImg(url); } });
    return () => url && URL.revokeObjectURL(url);
  }, [card]);
  return (
    <div className="sc-card sc-rise mx-auto mt-4 w-full max-w-md p-4" data-testid="sc-attempt-share">
      <div className="flex items-center gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-amber-300/40 bg-black/30">
          {img && <img src={img} alt={`Attempt ${attempt.attempt_no} scorecard`} className="h-full w-full object-cover" data-testid="sc-attempt-card-image" />}
        </div>
        <p className="text-sm text-white/80">Your attempt {attempt.attempt_no} scorecard is ready. Save it or share it now.</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Btn icon={Download} gold onClick={() => save('story')} testId="sc-attempt-save">Save</Btn>
        <Btn icon={MessageCircle} onClick={whatsapp} testId="sc-attempt-whatsapp">WhatsApp</Btn>
        <Btn icon={Instagram} onClick={instagram} testId="sc-attempt-instagram">Instagram</Btn>
      </div>
      {igHelp && <div className="mt-3"><IgHelp /></div>}
    </div>
  );
}

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
