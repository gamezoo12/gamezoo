/**
 * Announcement ticker — smooth right-to-left marquee under the nav.
 * Pauses on hover (desktop). Fully responsive.
 */
const ITEMS = [
  { icon: '🎉', text: 'Play Skill-Based Games' },
  { icon: '⚡', text: 'Enter Exciting Contests' },
  { icon: '🏆', text: 'Win Amazing Prizes with Prize League' },
  { icon: '✨', text: 'New contests every week — brand-new skill games each drop' },
];

export default function AnnouncementTicker() {
  const chunk = (
    <div className="flex items-center gap-12 shrink-0 whitespace-nowrap">
      {ITEMS.map((it) => (
        <span key={it.text} className="inline-flex items-center gap-2 text-white/95 font-semibold text-sm md:text-[15px]">
          <span aria-hidden>{it.icon}</span>
          <span>{it.text}</span>
          <span className="text-[#FFD54A] mx-1">•</span>
        </span>
      ))}
    </div>
  );
  return (
    <div
      className="pl-marquee relative overflow-hidden border-y border-white/10"
      style={{ background: 'linear-gradient(90deg, #6C2BFF 0%, #8B5CFF 50%, #6C2BFF 100%)' }}
      data-testid="announcement-ticker"
      aria-label="Announcements"
    >
      <div className="pl-marquee-track py-2.5">
        {chunk}
        {chunk}
      </div>
    </div>
  );
}
