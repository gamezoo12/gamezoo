import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Image, Italic, Monitor, Smartphone, Strikethrough, Tablet, Underline, Upload } from 'lucide-react';
import { adminAPI, worldAdminAPI } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/media';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/use-toast';

const EMPTY = {
  paid_mobile: '', paid_tablet: '', paid_desktop: '',
  free_mobile: '', free_tablet: '', free_desktop: '',
  heading: 'Choose your world', subheading: 'Play the way you want',
  font_family: 'Georgia, serif', font_size: 48, font_weight: 800,
  font_italic: false, font_underline: false, font_strike: false, line_height: 1.05,
  text_shadow: true, text_shadow_color: '#000000', text_shadow_blur: 8,
  text_outline: false, text_outline_color: '#000000', text_outline_width: 1,
  text_border: false, text_border_color: '#ffffff', text_border_width: 1, text_border_radius: 0,
  text_padding_x: 0, text_padding_y: 0, text_opacity: 100, fade_direction: 'none',
  text_highlight: false, text_highlight_color: '#facc15', text_gradient: false, text_gradient_color: '#facc15', text_gradient_angle: 90, text_gradient_preset: 'custom', text_preset: 'custom',
  sub_font_family: 'Georgia, serif', sub_font_size: 22, sub_font_weight: 700,
  sub_font_italic: false, sub_font_underline: false, sub_line_height: 1.2, sub_letter_spacing: 0,
  text_color: '#ffffff', accent_color: '#facc15', text_align: 'center',
  background_type: 'gradient', background_color: '#020611', background_color_2: '#172033', background_image: '',
  background_mobile: '', background_tablet: '', background_desktop: '',
  header_gap_tablet: 41, header_gap_desktop: 72,
  title_gap_mobile: 22, title_gap_tablet: 24, title_gap_desktop: 36,
  image_gap_mobile: 12, image_gap_tablet: 20, image_gap_desktop: 32,
  mobile_title_size: 34, tablet_title_size: 42, desktop_title_size: 48,
  mobile_subtitle_size: 16, tablet_subtitle_size: 20, desktop_subtitle_size: 22,
  letter_spacing: 0, heading_case: 'none',
};
const FONT_BASES = [
  'Arial', 'Arial Black', 'Arial Narrow', 'Aptos', 'Aptos Display', 'Aptos Mono', 'Avenir', 'Avenir Next',
  'Baskerville', 'Bodoni 72', 'Book Antiqua', 'Bookman Old Style', 'Bradley Hand', 'Brush Script MT', 'Calibri', 'Cambria',
  'Candara', 'Century Gothic', 'Century Schoolbook', 'Charter', 'Comic Sans MS', 'Consolas', 'Constantia', 'Cooper Black',
  'Copperplate', 'Courier New', 'Didot', 'DIN Alternate', 'Ebrima', 'Franklin Gothic Medium', 'Futura', 'Gabriola',
  'Garamond', 'Geneva', 'Georgia', 'Gill Sans', 'Haettenschweiler', 'Helvetica', 'Helvetica Neue', 'Hoefler Text', 'Impact',
  'Kohinoor', 'Lucida Bright', 'Lucida Console', 'Lucida Handwriting', 'Lucida Sans', 'Lucida Sans Unicode', 'Luminari', 'Marion',
  'Menlo', 'Microsoft Sans Serif', 'Minion Pro', 'Monaco', 'Myriad Pro', 'New Century Schoolbook', 'Noto Sans', 'Noto Serif',
  'Optima', 'Palatino', 'Palatino Linotype', 'Papyrus', 'Perpetua', 'Plantagenet Cherokee', 'Rockwell', 'Segoe Print', 'Segoe Script',
  'Segoe UI', 'Segoe UI Black', 'Segoe UI Light', 'Segoe UI Semibold', 'Sitka Banner', 'Sitka Display', 'Sitka Heading', 'Sitka Small',
  'Skia', 'Snell Roundhand', 'Tahoma', 'Times', 'Times New Roman', 'Trebuchet MS', 'Tw Cen MT', 'Verdana', 'Webdings', 'Wingdings',
  'Yu Gothic', 'Arial Rounded MT Bold', 'Bauhaus 93', 'Berlin Sans FB', 'Bodoni MT', 'Broadway', 'Britannic Bold', 'Californian FB',
  'Castellar', 'Chalkboard', 'Chalkduster', 'Colonna MT', 'Edwardian Script ITC', 'Elephant', 'Engravers MT', 'Felix Titling', 'Forte',
  'Freestyle Script', 'Goudy Old Style', 'Harrington', 'High Tower Text', 'Imprint MT Shadow', 'Jokerman', 'Magneto', 'Matura MT Script Capitals',
];
const FONTS = [...new Set(FONT_BASES.map(name => `${name}, ${/Mono|Console|Courier|Consolas|Menlo|Monaco/i.test(name) ? 'monospace' : /Script|Hand|Gothic|Arial|Aptos|Segoe|Tahoma|Verdana|Helvetica|Futura|Century/i.test(name) ? 'sans-serif' : 'serif'}`))];
const TEXT_PRESETS = [
  ['clean', 'Clean'], ['gold', 'Gold'], ['neon', 'Neon'], ['outline', 'Outline'], ['shadow', 'Shadow'], ['fade', 'Fade'], ['highlight', 'Highlight'], ['gradient', 'Gradient'],
];
const TITLE_GAP_LIMITS = { mobile: 160, tablet: 200, desktop: 240 };
const IMAGE_GAP_LIMITS = { mobile: 100, tablet: 120, desktop: 160 };
const gapValue = (value, limit) => Math.max(0, Math.min(limit, Math.round(Number(value) || 0)));
const GRADIENT_NAMES = ['Aurora', 'Royal', 'Champagne', 'Sunrise', 'Ocean', 'Emerald', 'Ruby', 'Galaxy', 'Coral', 'Electric', 'Moonlight', 'Fire', 'Ice', 'Forest', 'Rose', 'Diamond', 'Cobalt', 'Amber', 'Violet', 'Tropical'];
const hslHex = (h, s, l) => {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map(v => Math.round(255 * v).toString(16).padStart(2, '0')).join('')}`;
};
const GRADIENT_PRESETS = Array.from({ length: 100 }, (_, index) => {
  const hue = (index * 137.508) % 360;
  const hue2 = (hue + 42 + (index % 6) * 18) % 360;
  const angle = [0, 45, 90, 135, 180, 225, 270, 315][index % 8];
  return { id: `premium-${index + 1}`, name: `${GRADIENT_NAMES[index % GRADIENT_NAMES.length]} ${Math.floor(index / GRADIENT_NAMES.length) + 1}`, from: hslHex(hue, 82, 46 + (index % 4) * 5), to: hslHex(hue2, 88, 62 + (index % 5) * 4), angle };
});

function applyTextPreset(values, preset) {
  const base = { text_preset: preset, text_shadow: false, text_outline: false, text_border: false, text_highlight: false, text_gradient: false, fade_direction: 'none', text_opacity: 100 };
  if (preset === 'clean') return { ...base, font_family: 'Aptos Display, sans-serif', font_weight: 800, text_color: '#ffffff' };
  if (preset === 'gold') return { ...base, font_family: 'Georgia, serif', font_weight: 800, text_color: '#facc15', text_gradient: true, text_gradient_color: '#fff4b8', text_shadow: true, text_shadow_color: '#78350f', text_shadow_blur: 12 };
  if (preset === 'neon') return { ...base, font_family: 'Trebuchet MS, sans-serif', font_weight: 900, text_color: '#67e8f9', text_shadow: true, text_shadow_color: '#06b6d4', text_shadow_blur: 18, text_outline: true, text_outline_width: 1, text_outline_color: '#ecfeff' };
  if (preset === 'outline') return { ...base, text_color: '#ffffff', text_outline: true, text_outline_width: 3, text_outline_color: '#111827' };
  if (preset === 'shadow') return { ...base, text_shadow: true, text_shadow_color: '#000000', text_shadow_blur: 20 };
  if (preset === 'fade') return { ...base, text_opacity: 82, fade_direction: 'up' };
  if (preset === 'highlight') return { ...base, text_color: '#111827', text_highlight: true, text_highlight_color: '#facc15', text_padding_x: 14, text_padding_y: 5, text_border_radius: 6 };
  if (preset === 'gradient') return { ...base, text_gradient: true, text_color: '#38bdf8', text_gradient_color: '#f472b6' };
  return base;
}

function textStyle(values) {
  const decoration = [values.font_underline ? 'underline' : '', values.font_strike ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';
  return {
    color: values.text_gradient ? 'transparent' : values.text_color,
    backgroundImage: values.text_gradient ? `linear-gradient(${Number(values.text_gradient_angle || 90)}deg, ${values.text_color}, ${values.text_gradient_color})` : undefined,
    WebkitBackgroundClip: values.text_gradient ? 'text' : undefined,
    fontFamily: values.font_family, fontSize: values.font_size, fontWeight: values.font_weight,
    fontStyle: values.font_italic ? 'italic' : 'normal', textDecoration: decoration,
    lineHeight: values.line_height, letterSpacing: values.letter_spacing, textAlign: values.text_align,
    textTransform: values.heading_case, opacity: Number(values.text_opacity ?? 100) / 100,
    padding: `${values.text_padding_y}px ${values.text_padding_x}px`,
    border: values.text_border ? `${values.text_border_width}px solid ${values.text_border_color}` : undefined,
    borderRadius: values.text_border ? values.text_border_radius : undefined,
    backgroundColor: values.text_highlight ? values.text_highlight_color : undefined,
    textShadow: values.text_shadow ? `0 2px ${values.text_shadow_blur}px ${values.text_shadow_color}` : 'none',
    WebkitTextStroke: values.text_outline ? `${values.text_outline_width}px ${values.text_outline_color}` : undefined,
  };
}

function ToolbarButton({ active, label, onClick, children }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={`grid h-9 w-9 place-items-center border ${active ? 'border-[#6C2BFF] bg-[#6C2BFF] text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{children}</button>;
}

function SelectorPreview({ values, device }) {
  const frameRef = useRef(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const mobile = device === 'mobile';
  const tablet = device === 'tablet';
  const suffix = mobile ? 'mobile' : tablet ? 'tablet' : 'desktop';
  const backgroundImage = values[`background_${suffix}`] || values.background_image;
  const background = values.background_type === 'image' && backgroundImage
    ? `url("${resolveMediaUrl(backgroundImage)}") center / cover`
    : values.background_type === 'gradient'
      ? `linear-gradient(135deg, ${values.background_color}, ${values.background_color_2})`
      : values.background_color;
  const title = { ...textStyle(values), fontSize: values[`${suffix}_title_size`], display: 'inline-block', maxWidth: '100%' };
  const viewport = mobile ? { width: 390, height: 844, label: '390 × 844' } : tablet ? { width: 820, height: 1180, label: '820 × 1180' } : { width: 1440, height: 900, label: '1440 × 900' };
  const previewWidth = mobile ? 360 : tablet ? 650 : 1100;
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const updateWidth = () => setFrameWidth(frame.clientWidth);
    updateWidth();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
    const observer = new ResizeObserver(updateWidth);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [device]);
  const horizontalPadding = Math.max(12, Math.min(40, viewport.width * 0.03));
  return <div ref={frameRef} data-preview-viewport={viewport.label} className="overflow-hidden border border-slate-300 bg-slate-900" style={{ width: '100%', maxWidth: previewWidth, aspectRatio: `${viewport.width} / ${viewport.height}`, background }}>
    <div style={{ width: viewport.width, height: viewport.height, overflowY: 'auto', overflowX: 'hidden', transform: `scale(${(frameWidth || previewWidth) / viewport.width})`, transformOrigin: 'top left', textAlign: values.text_align, padding: `${mobile ? 30 : values[`header_gap_${suffix}`]}px ${horizontalPadding}px 10px` }}>
      <div style={title}>{values.heading || 'Choose your world'}</div>
      {values.subheading && <div style={{ color: values.accent_color, fontFamily: values.sub_font_family, fontSize: values[`${suffix}_subtitle_size`], fontWeight: values.sub_font_weight, fontStyle: values.sub_font_italic ? 'italic' : 'normal', textDecoration: values.sub_font_underline ? 'underline' : 'none', lineHeight: values.sub_line_height, letterSpacing: values.sub_letter_spacing, marginTop: 10 }}>{values.subheading}</div>}
      <div className={mobile || tablet ? 'grid grid-cols-1' : 'grid grid-cols-2'} style={{ gap: values[`image_gap_${suffix}`], marginTop: values[`title_gap_${suffix}`] + (mobile ? 8 : 0), maxWidth: mobile ? 520 : tablet ? 560 : undefined, marginLeft: mobile || tablet ? 'auto' : undefined, marginRight: mobile || tablet ? 'auto' : undefined }}>
        {['paid', 'free'].map(world => {
          const image = values[`${world}_${suffix}`] || values[`${world}_desktop`] || values[`${world}_tablet`] || values[`${world}_mobile`];
          return <div key={world} className="overflow-hidden border border-white/20 bg-slate-950" style={{ height: mobile ? Math.max(180, Math.min(280, viewport.height * 0.32)) : undefined, aspectRatio: mobile ? undefined : '16 / 10' }}>
            {image ? <img src={resolveMediaUrl(image)} alt={`${world} ${suffix} preview`} className={`h-full w-full ${mobile ? 'object-contain' : 'object-cover'}`} /> : <div className="grid h-full place-items-center text-xs font-bold text-white/40">{world.toUpperCase()} WORLD IMAGE</div>}
          </div>;
        })}
      </div>
    </div>
  </div>;
}

export default function WorldSelectionImages() {
  const { toast } = useToast();
  const [values, setValues] = useState(EMPTY);
  const [busy, setBusy] = useState('');
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const [loadState, setLoadState] = useState('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    worldAdminAPI.selectionImages().then(data => {
      if (active) { setValues({ ...EMPTY, ...data }); setLoadState('ready'); }
    }).catch(() => { if (active) setLoadState('error'); });
    return () => { active = false; };
  }, [loadAttempt]);

  const upload = async (field, file) => {
    if (!file) return;
    setBusy(field);
    try {
      const result = await adminAPI.uploadWorldSelectionImage(field, file);
      const next = { ...values, [field]: result.url };
      const saved = await worldAdminAPI.setSelectionImages(next);
      const finalValues = { ...EMPTY, ...saved };
      setValues(finalValues);
      try { localStorage.setItem('pl-world-selection-design', JSON.stringify(finalValues)); } catch {}
      window.dispatchEvent(new CustomEvent('pl-world-selection-design-updated', { detail: finalValues }));
      toast({ title: 'Image optimized and published', description: `${Math.round(result.size / 1024)} KB WebP · ${result.width} × ${result.height}` });
    } catch (error) {
      toast({ title: 'Upload failed', description: error?.response?.data?.detail || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  const save = async (nextValues = values, reset = false) => {
    setBusy(reset ? 'reset' : 'save');
    try {
      const saved = await worldAdminAPI.setSelectionImages(nextValues);
      const finalValues = { ...EMPTY, ...saved };
      setValues(finalValues);
      try { localStorage.setItem('pl-world-selection-design', JSON.stringify(finalValues)); } catch {}
      window.dispatchEvent(new CustomEvent('pl-world-selection-design-updated', { detail: finalValues }));
      toast({ title: reset ? 'Bundled images restored' : 'World selection images saved' });
    } catch (error) {
      toast({ title: 'Save failed', description: error?.response?.data?.detail || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  if (loadState !== 'ready') {
    return <section className="border border-slate-200 bg-white p-5" data-testid="world-selection-images">
      {loadState === 'loading' ? <p>Loading world selection design...</p> : <div role="alert">Could not load the saved design. <button type="button" className="font-bold underline" onClick={() => setLoadAttempt(attempt => attempt + 1)}>Retry</button></div>}
    </section>;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="world-selection-images">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><Image className="h-5 w-5 text-[#6C2BFF]" /> World selection design</h2>
          <p className="mt-1 text-xs text-slate-500">Upload one holder image per world and screen size. The complete image holder is clickable.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => save({ ...EMPTY }, true)} disabled={Boolean(busy)}>{busy === 'reset' ? 'Restoring...' : 'Restore bundled images'}</Button>
          <Button type="button" onClick={() => save()} disabled={Boolean(busy)} className="pl-btn-purple text-white">{busy === 'save' ? 'Saving...' : 'Save images'}</Button>
        </div>
      </div>

      <div className="mt-5 border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-black text-slate-900">Title editing settings</h3>
          <div className="text-[10px] font-bold text-slate-500">{FONTS.length} font families · 9 weights · live preview</div>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-black uppercase text-slate-500">Quick text samples</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {TEXT_PRESETS.map(([preset, label]) => {
              const sample = { ...values, ...applyTextPreset(values, preset), heading: 'Aa' };
              return <button key={preset} type="button" onClick={() => setValues(current => ({ ...current, ...applyTextPreset(current, preset) }))} className={`min-h-20 overflow-hidden border bg-slate-950 p-2 ${values.text_preset === preset ? 'border-[#6C2BFF] ring-2 ring-[#6C2BFF]/30' : 'border-slate-700'}`}><span className="block truncate text-center" style={{ ...textStyle(sample), fontSize: 25, padding: 2 }}>{label}</span><span className="mt-2 block text-[10px] font-bold text-slate-300">{label}</span></button>;
            })}
          </div>
        </div>
        <div className="mt-4 border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-black uppercase text-slate-500">100 premium gradient styles</span><span className="text-[10px] text-slate-500">Select a sample to apply its colours and angle</span></div>
          <div className="grid max-h-44 grid-cols-4 gap-2 overflow-y-auto p-1 sm:grid-cols-6 lg:grid-cols-10">
            {GRADIENT_PRESETS.map(preset => <button key={preset.id} type="button" title={preset.name} onClick={() => setValues(current => ({ ...current, text_gradient: true, text_color: preset.from, text_gradient_color: preset.to, text_gradient_angle: preset.angle, text_gradient_preset: preset.id }))} className={`h-12 border text-[9px] font-black text-white shadow-sm ${values.text_gradient_preset === preset.id ? 'border-slate-950 ring-2 ring-slate-950' : 'border-white/40'}`} style={{ background: `linear-gradient(${preset.angle}deg, ${preset.from}, ${preset.to})` }}><span className="block bg-slate-950/35 px-1 py-0.5">{preset.name}</span></button>)}
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Heading text<textarea value={values.heading} maxLength={160} rows={2} onChange={e => setValues(current => ({ ...current, heading: e.target.value }))} className="mt-1 w-full resize-none border border-slate-200 bg-white px-3 py-2 font-normal" /></label>
          <label className="text-xs font-bold text-slate-600">Subtitle text<textarea value={values.subheading} maxLength={240} rows={2} onChange={e => setValues(current => ({ ...current, subheading: e.target.value }))} className="mt-1 w-full resize-none border border-slate-200 bg-white px-3 py-2 font-normal" /></label>
        </div>

        <div className="mt-3 border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Heading font family" value={values.font_family} onChange={e => setValues(current => ({ ...current, font_family: e.target.value }))} className="h-9 min-w-48 flex-1 border border-slate-200 px-2 text-sm">{FONTS.map(font => <option key={font} value={font} style={{ fontFamily: font }}>{font.split(',')[0]}</option>)}</select>
            <input aria-label="Heading font size" type="number" min="12" max="160" value={values.font_size} onChange={e => { const size = Math.max(12, Math.min(160, Number(e.target.value) || 12)); setValues(current => ({ ...current, font_size: size, mobile_title_size: size, tablet_title_size: size, desktop_title_size: size })); }} className="h-9 w-20 border border-slate-200 px-2 text-sm" />
            <select aria-label="Heading font weight" value={values.font_weight} onChange={e => setValues(current => ({ ...current, font_weight: Number(e.target.value) }))} className="h-9 w-24 border border-slate-200 px-2 text-sm">{[100,200,300,400,500,600,700,800,900].map(weight => <option key={weight}>{weight}</option>)}</select>
            <ToolbarButton active={values.font_weight >= 700} label="Bold" onClick={() => setValues(current => ({ ...current, font_weight: current.font_weight >= 700 ? 400 : 700 }))}><Bold size={16} /></ToolbarButton>
            <ToolbarButton active={values.font_italic} label="Italic" onClick={() => setValues(current => ({ ...current, font_italic: !current.font_italic }))}><Italic size={16} /></ToolbarButton>
            <ToolbarButton active={values.font_underline} label="Underline" onClick={() => setValues(current => ({ ...current, font_underline: !current.font_underline }))}><Underline size={16} /></ToolbarButton>
            <ToolbarButton active={values.font_strike} label="Strikethrough" onClick={() => setValues(current => ({ ...current, font_strike: !current.font_strike }))}><Strikethrough size={16} /></ToolbarButton>
            <label className="relative grid h-9 w-9 cursor-pointer place-items-center border border-slate-200 bg-white" title="Text colour"><span className="h-4 w-4 border border-slate-300" style={{ background: values.text_color }} /><input type="color" value={values.text_color} onChange={e => setValues(current => ({ ...current, text_color: e.target.value }))} className="absolute inset-0 opacity-0" /></label>
            {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([align, Icon]) => <ToolbarButton key={align} active={values.text_align === align} label={`Align ${align}`} onClick={() => setValues(current => ({ ...current, text_align: align }))}><Icon size={16} /></ToolbarButton>)}
            <select aria-label="Text case" value={values.heading_case} onChange={e => setValues(current => ({ ...current, heading_case: e.target.value }))} className="h-9 border border-slate-200 px-2 text-sm"><option value="none">Original case</option><option value="uppercase">UPPERCASE</option><option value="lowercase">lowercase</option></select>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-xs font-bold text-slate-600">Line height<input type="number" step="0.05" min="0.8" max="3" value={values.line_height} onChange={e => setValues(current => ({ ...current, line_height: Number(e.target.value) || 1 }))} className="mt-1 h-9 w-full border border-slate-200 px-2 font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Letter spacing<input type="number" min="-5" max="20" value={values.letter_spacing} onChange={e => setValues(current => ({ ...current, letter_spacing: Number(e.target.value) || 0 }))} className="mt-1 h-9 w-full border border-slate-200 px-2 font-normal" /></label>
            <label className="text-xs font-bold text-slate-600">Subtitle colour<input type="color" value={values.accent_color} onChange={e => setValues(current => ({ ...current, accent_color: e.target.value }))} className="mt-1 h-9 w-full border border-slate-200 bg-white" /></label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold text-slate-600">Opacity {values.text_opacity}%<input type="range" min="0" max="100" value={values.text_opacity} onChange={e => setValues(current => ({ ...current, text_opacity: Number(e.target.value) }))} className="mt-3 w-full" /></label>
            <label className="text-xs font-bold text-slate-600">Fade direction<select value={values.fade_direction} onChange={e => setValues(current => ({ ...current, fade_direction: e.target.value }))} className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 font-normal"><option value="none">No fade</option><option value="up">Fade up</option><option value="down">Fade down</option><option value="left">Fade left</option><option value="right">Fade right</option></select></label>
            <label className="text-xs font-bold text-slate-600">Border colour<input type="color" value={values.text_border_color} onChange={e => setValues(current => ({ ...current, text_border: true, text_border_color: e.target.value }))} className="mt-1 h-9 w-full border border-slate-200 bg-white" /></label>
            <label className="text-xs font-bold text-slate-600">Border / radius<input type="number" min="0" max="8" value={values.text_border_width} onChange={e => setValues(current => ({ ...current, text_border: true, text_border_width: Number(e.target.value) || 0 }))} className="mt-1 h-9 w-[46%] border border-slate-200 px-2 font-normal" /><input type="number" min="0" max="40" value={values.text_border_radius} onChange={e => setValues(current => ({ ...current, text_border_radius: Number(e.target.value) || 0 }))} className="ml-[8%] mt-1 h-9 w-[46%] border border-slate-200 px-2 font-normal" /></label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-bold text-slate-600">Outline colour<input type="color" value={values.text_outline_color} onChange={e => setValues(current => ({ ...current, text_outline: true, text_outline_color: e.target.value }))} className="mt-1 h-9 w-full border border-slate-200 bg-white" /></label>
            <label className="text-xs font-bold text-slate-600">Shadow colour<input type="color" value={values.text_shadow_color} onChange={e => setValues(current => ({ ...current, text_shadow: true, text_shadow_color: e.target.value }))} className="mt-1 h-9 w-full border border-slate-200 bg-white" /></label>
            <label className="text-xs font-bold text-slate-600">Highlight colour<input type="color" value={values.text_highlight_color} onChange={e => setValues(current => ({ ...current, text_highlight: true, text_highlight_color: e.target.value }))} className="mt-1 h-9 w-full border border-slate-200 bg-white" /></label>
            <label className="text-xs font-bold text-slate-600">Gradient end colour<input type="color" value={values.text_gradient_color} onChange={e => setValues(current => ({ ...current, text_gradient: true, text_gradient_color: e.target.value, text_gradient_preset: 'custom' }))} className="mt-1 h-9 w-full border border-slate-200 bg-white" /></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-slate-600">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={values.text_shadow} onChange={e => setValues(current => ({ ...current, text_shadow: e.target.checked }))} />Shadow</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={values.text_outline} onChange={e => setValues(current => ({ ...current, text_outline: e.target.checked }))} />Outline</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={values.text_border} onChange={e => setValues(current => ({ ...current, text_border: e.target.checked }))} />Border</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={values.text_highlight} onChange={e => setValues(current => ({ ...current, text_highlight: e.target.checked }))} />Highlight</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={values.text_gradient} onChange={e => setValues(current => ({ ...current, text_gradient: e.target.checked }))} />Gradient text</label>
            <input aria-label="Highlight colour" type="color" value={values.text_highlight_color} onChange={e => setValues(current => ({ ...current, text_highlight: true, text_highlight_color: e.target.value }))} className="h-8 w-12 border border-slate-200" />
            <input aria-label="Gradient second colour" type="color" value={values.text_gradient_color} onChange={e => setValues(current => ({ ...current, text_gradient: true, text_gradient_color: e.target.value }))} className="h-8 w-12 border border-slate-200" />
            <label className="inline-flex items-center gap-2">Shadow blur<input type="number" min="0" max="40" value={values.text_shadow_blur} onChange={e => setValues(current => ({ ...current, text_shadow_blur: Number(e.target.value) || 0 }))} className="h-8 w-16 border border-slate-200 px-2" /></label>
            <label className="inline-flex items-center gap-2">Outline width<input type="number" min="0" max="8" value={values.text_outline_width} onChange={e => setValues(current => ({ ...current, text_outline_width: Number(e.target.value) || 0 }))} className="h-8 w-16 border border-slate-200 px-2" /></label>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold text-slate-600">Subtitle font<select value={values.sub_font_family} onChange={e => setValues(current => ({ ...current, sub_font_family: e.target.value }))} className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 font-normal">{FONTS.map(font => <option key={font} value={font}>{font.split(',')[0]}</option>)}</select></label>
          {['tablet', 'desktop'].map(device => <label key={`header-gap-${device}`} className="text-xs font-bold text-slate-600">{device === 'tablet' ? 'Tablet portrait' : 'Desktop / landscape'} header to title gap<input aria-label={`${device} header to title gap`} type="number" min="0" max="240" value={values[`header_gap_${device}`]} onChange={e => { const value = gapValue(e.target.value, 240); setValues(current => ({ ...current, [`header_gap_${device}`]: value })); }} className="mt-1 h-9 w-full border border-slate-200 bg-white px-2 font-normal" /></label>)}
          {['mobile', 'tablet', 'desktop'].map(device => <label key={`title-${device}`} className="text-xs font-bold text-slate-600">{device === 'mobile' ? 'Phone portrait' : device === 'tablet' ? 'Tablet portrait' : 'Desktop / landscape'} title / subtitle<input type="number" min="12" max="160" value={values[`${device}_title_size`]} onChange={e => setValues(current => ({ ...current, [`${device}_title_size`]: Number(e.target.value) || 12 }))} className="mt-1 h-9 w-[48%] border border-slate-200 bg-white px-2 font-normal" /><input type="number" min="10" max="120" value={values[`${device}_subtitle_size`]} onChange={e => setValues(current => ({ ...current, [`${device}_subtitle_size`]: Number(e.target.value) || 10 }))} className="ml-[4%] mt-1 h-9 w-[48%] border border-slate-200 bg-white px-2 font-normal" /></label>)}
          {['mobile', 'tablet', 'desktop'].map(device => <label key={`gap-${device}`} className="text-xs font-bold text-slate-600">{device === 'mobile' ? 'Phone portrait' : device === 'tablet' ? 'Tablet portrait' : 'Desktop / landscape'} title gap / image gap<input aria-label={`${device} title to images gap`} type="number" min="0" max={TITLE_GAP_LIMITS[device]} value={values[`title_gap_${device}`]} onChange={e => { const value = gapValue(e.target.value, TITLE_GAP_LIMITS[device]); setValues(current => ({ ...current, [`title_gap_${device}`]: value })); }} className="mt-1 h-9 w-[48%] border border-slate-200 bg-white px-2 font-normal" /><input aria-label={`${device} image gap`} type="number" min="0" max={IMAGE_GAP_LIMITS[device]} value={values[`image_gap_${device}`]} onChange={e => { const value = gapValue(e.target.value, IMAGE_GAP_LIMITS[device]); setValues(current => ({ ...current, [`image_gap_${device}`]: value })); }} className="ml-[4%] mt-1 h-9 w-[48%] border border-slate-200 bg-white px-2 font-normal" /></label>)}
        </div>
        <div className="mt-5 border border-slate-200 bg-white p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-black text-slate-900">Exact orientation preview</div><div className="text-[11px] text-slate-500">{previewDevice === 'mobile' ? 'Phone portrait · 390 × 844' : previewDevice === 'tablet' ? 'Tablet portrait · 820 × 1180' : 'Desktop or any landscape screen · 1440 × 900'}</div></div><div className="inline-flex border border-slate-200 bg-slate-50 p-1">{[['desktop', Monitor, 'Landscape'], ['tablet', Tablet, 'Tablet portrait'], ['mobile', Smartphone, 'Phone portrait']].map(([device, Icon, label]) => <button key={device} type="button" onClick={() => setPreviewDevice(device)} className={`inline-flex h-8 items-center gap-2 px-3 text-xs font-bold ${previewDevice === device ? 'bg-slate-900 text-white' : 'text-slate-600'}`}><Icon size={14} />{label}</button>)}</div></div>
          <div className="flex justify-center overflow-auto bg-slate-100 p-3"><SelectorPreview values={values} device={previewDevice} /></div>
        </div>
      </div>

      <div className="mt-5 border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-black text-slate-900">Background colour or image settings</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold text-slate-600">Background type<select value={values.background_type} onChange={e => setValues(current => ({ ...current, background_type: e.target.value }))} className="mt-1 h-10 w-full border border-slate-200 bg-white px-3 font-normal"><option value="solid">Solid colour</option><option value="gradient">Gradient colours</option><option value="image">Background image</option></select></label>
          <label className="text-xs font-bold text-slate-600">Background colour<input type="color" value={values.background_color} onChange={e => setValues(current => ({ ...current, background_color: e.target.value }))} className="mt-1 h-10 w-full border border-slate-200 bg-white" /></label>
          <label className="text-xs font-bold text-slate-600">Second gradient colour<input type="color" value={values.background_color_2} onChange={e => setValues(current => ({ ...current, background_color_2: e.target.value }))} className="mt-1 h-10 w-full border border-slate-200 bg-white" /></label>
          <div className="lg:col-span-4">
            <div className="text-xs font-black text-slate-700">Background image holders by orientation</div>
            <p className="mt-1 text-[11px] text-slate-500">Phone portrait uses Mobile. Tablet portrait uses Tablet. Phone landscape, tablet landscape, laptop and desktop use Desktop/Landscape.</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {['mobile', 'tablet', 'desktop'].map(device => <label key={`background-${device}`} className="text-xs font-bold text-slate-600"><span>{device === 'mobile' ? 'Phone portrait' : device === 'tablet' ? 'Tablet portrait' : 'Desktop / landscape'}</span><span className="mt-1 grid h-24 place-items-center overflow-hidden border border-dashed border-slate-300 bg-white">{values[`background_${device}`] ? <img src={resolveMediaUrl(values[`background_${device}`])} alt={`${device} background`} className="h-full w-full object-cover" /> : <Upload className="h-5 w-5 text-slate-400" />}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={e => upload(`background_${device}`, e.target.files?.[0])} className="mt-1 w-full text-[10px]" /><input type="url" value={values[`background_${device}`] || ''} onChange={e => setValues(current => ({ ...current, [`background_${device}`]: e.target.value }))} placeholder="Background URL" className="mt-1 h-8 w-full border border-slate-200 bg-white px-2 font-normal" /></label>)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2" data-testid="world-image-holders">
        <h3 className="text-sm font-black text-slate-900 lg:col-span-2">World image holders</h3>
        {['paid', 'free'].map(world => (
          <div key={world} className="border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-black text-slate-900">{world === 'paid' ? 'Paid World image holders' : 'Free World image holders'}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {['mobile', 'tablet', 'desktop'].map(device => {
                const field = `${world}_${device}`;
                return (
                  <label key={field} className="block text-xs font-bold text-slate-600">
                    <span className="capitalize">{device === 'mobile' ? 'Phone portrait · 900 × 1600 px recommended' : device === 'tablet' ? 'Tablet portrait · 1200 × 1600 px recommended' : 'Landscape / desktop · 1920 × 1080 px recommended'}</span>
                    <span className="mt-1 grid aspect-[4/3] place-items-center overflow-hidden border border-dashed border-slate-300 bg-white">
                      {values[field] ? <img src={resolveMediaUrl(values[field])} alt={`${world} ${device}`} className="h-full w-full object-contain" /> : <Upload className="h-5 w-5 text-slate-400" />}
                    </span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 w-full text-[10px]" disabled={Boolean(busy)} onChange={event => upload(field, event.target.files?.[0])} />
                    <input type="url" value={values[field] || ''} onChange={event => setValues(current => ({ ...current, [field]: event.target.value }))} placeholder="Or paste image URL" className="mt-2 h-8 w-full border border-slate-200 bg-white px-2 text-[10px] font-normal" />
                    {busy === field && <span className="mt-1 block text-[#6C2BFF]">Uploading...</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
