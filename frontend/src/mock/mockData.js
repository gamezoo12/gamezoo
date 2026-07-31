// Prize League — public static content used for pages that do not require
// live server data (nav labels, FAQs, category filters, "how it works" copy).
//
// PRODUCTION LAUNCH STATE: every runtime array (contests, winners, stats,
// admin/production tables) is EMPTY. Real content is populated once contests,
// winners and users start flowing through the platform.

export const IMAGES = {};

// Hero rotator falls back to live contests from the API — this array is kept
// empty so no stale marketing claims appear pre-launch.
export const HERO_SLIDES = [];

// Homepage stats bar is currently NOT rendered on the launch home page. Left
// empty so any accidental import shows a blank strip instead of fake numbers.
export const SITE_STATS = [];

// Real contests come from /api/contests. No local fallbacks — an empty state
// is the correct pre-launch experience.
export const COMPETITIONS = [];

// Populated as real winners come in.
export const WINNERS = [];
export const STORIES = [];
export const REVIEWS = [];

export const HOW_IT_WORKS = [
  { step: 1, title: 'Pick a contest', desc: 'Browse live skill contests and pick one you fancy.' },
  { step: 2, title: 'Solve the skill puzzle', desc: 'Answer a genuine skill question — math, trivia, or word puzzle.' },
  { step: 3, title: 'Buy your ticket', desc: 'Pay the entry fee per ticket via card, Apple Pay or Google Pay.' },
  { step: 4, title: 'Winner announced live', desc: 'Draw is broadcast live — winners paid or shipped within 24 hours.' },
];

export const FAQ_ITEMS = [
  { q: 'Is Prize League gambling?', a: 'No. Prize League is a UK skill-based prize competition platform. Every entry requires you to correctly answer a genuine skill question. Entries with an incorrect answer are excluded from the draw, which places us outside the Gambling Act 2005 under the "skill-competition" exemption.' },
  { q: 'How do I enter a contest?', a: 'Pick a contest, correctly answer the skill question, choose the number of tickets you want, and pay the entry fee at checkout.' },
  { q: 'When are the draws?', a: 'Every contest has a published draw date and time on its page. All draws are live-streamed on our Production channel.' },
  { q: 'Is there a free entry route?', a: 'Yes — UK law requires a free postal entry alternative. Details are printed on every contest page under "Free Entry".' },
  { q: 'How do winners get paid?', a: 'Cash prizes are transferred to your bank account within 24 hours of the draw. Physical prizes ship free within 5 working days.' },
  { q: 'What happens if I answer wrong?', a: 'Incorrect answers are excluded from the prize draw, so please double-check before submitting. This is what makes Prize League a skill contest rather than a lottery.' },
  { q: 'Who can enter?', a: 'You must be 18+ and a UK resident. Verification may be required before payout.' },
  { q: 'How do I contact support?', a: 'Email support@prizeleague.co.uk — we typically reply within one business day.' },
];

export const NAV_LINKS = [
  { label: 'Contests', href: '/competitions' },
  { label: 'Leaderboard', href: '/leaderboard' },
  { label: 'Winners', href: '/winners' },
  { label: 'Draw Results', href: '/draw-results' },
  { label: 'How it Works', href: '/#how-it-works' },
  { label: 'FAQs', href: '/faq' },
];

export const CATEGORIES = [
  { slug: 'all', label: 'All Contests' },
  { slug: 'jackpot', label: 'Jackpot' },
  { slug: 'instant-wins', label: 'Instant Wins' },
  { slug: 'prize-draws', label: 'Prize Draws' },
  { slug: 'new-games', label: 'New Games' },
];

// Admin dashboards fetch real data from /api/admin/* — these are empty
// fallbacks so any un-migrated import renders a clean empty state.
export const ADMIN_USERS = [];
export const ADMIN_ORDERS = [];
export const REVENUE_SERIES = [];
export const PRODUCTION_TASKS = [];
export const PRIZE_INVENTORY = [];
