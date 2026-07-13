// Prize League mock data (production launch data)

const placeholders = {
  scratch: 'https://images.pexels.com/photos/7267577/pexels-photo-7267577.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  cash: 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  cashCoins: 'https://images.pexels.com/photos/15633962/pexels-photo-15633962.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  car: 'https://images.pexels.com/photos/19240616/pexels-photo-19240616.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  car2: 'https://images.pexels.com/photos/17081564/pexels-photo-17081564.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  vacuum: 'https://images.pexels.com/photos/14979011/pexels-photo-14979011.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  hairDryer: 'https://images.pexels.com/photos/9462148/pexels-photo-9462148.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  tech: 'https://images.pexels.com/photos/973406/pexels-photo-973406.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
  ipad: 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?auto=format&fit=crop&w=800&q=80',
  holiday: 'https://images.pexels.com/photos/27064826/pexels-photo-27064826.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
};
export const IMAGES = placeholders;

export const HERO_SLIDES = [
  { id: 1, title: 'Play. Solve. Win.', subtitle: 'Skill-based prize contests – solve a puzzle to enter. Fair, fun, and fully legal in the UK.', cta: 'Browse Contests', href: '/competitions', image: placeholders.cashCoins, accent: 'from-teal-500 to-emerald-500' },
  { id: 2, title: 'Win £250 Cash – Only £1 per Entry', subtitle: 'Answer one skill question, grab a ticket, join the live draw.', cta: 'Play Now', href: '/competitions', image: placeholders.cash, accent: 'from-orange-500 to-rose-500' },
  { id: 3, title: 'Skill-Based. Not Gambling.', subtitle: 'Every contest requires a genuine skill component – no chance-only draws.', cta: 'How it Works', href: '/#how-it-works', image: placeholders.tech, accent: 'from-amber-400 to-orange-500' },
];

export const SITE_STATS = [
  { label: 'Contests Live', value: '50', icon: 'Trophy' },
  { label: 'Prize Pool', value: '£7,500', icon: 'BadgePoundSterling' },
  { label: 'Skill Questions', value: '50+', icon: 'Sparkles' },
  { label: 'Entry From', value: '£1', icon: 'Coins' },
];

// Skill question bank - mix of trivia, math and word puzzles
const QBANK = [
  { q: 'What is 12 + 7?', options: ['17', '19', '21', '23'], answer: '19', type: 'math' },
  { q: 'What is 8 × 6?', options: ['42', '46', '48', '54'], answer: '48', type: 'math' },
  { q: 'What is 100 ÷ 4?', options: ['20', '25', '30', '40'], answer: '25', type: 'math' },
  { q: 'What is 15 − 8?', options: ['5', '6', '7', '8'], answer: '7', type: 'math' },
  { q: 'What is 9 × 9?', options: ['72', '81', '89', '99'], answer: '81', type: 'math' },
  { q: 'Capital city of France?', options: ['Rome', 'Madrid', 'Paris', 'Berlin'], answer: 'Paris', type: 'trivia' },
  { q: 'Which planet is closest to the Sun?', options: ['Venus', 'Mercury', 'Earth', 'Mars'], answer: 'Mercury', type: 'trivia' },
  { q: 'How many continents are there?', options: ['5', '6', '7', '8'], answer: '7', type: 'trivia' },
  { q: 'Who painted the Mona Lisa?', options: ['Van Gogh', 'Picasso', 'Da Vinci', 'Monet'], answer: 'Da Vinci', type: 'trivia' },
  { q: 'What colour do you get by mixing red + white?', options: ['Purple', 'Pink', 'Orange', 'Brown'], answer: 'Pink', type: 'trivia' },
  { q: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: '6', type: 'trivia' },
  { q: 'Largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 'Pacific', type: 'trivia' },
  { q: 'Rearrange: SILENT → which word?', options: ['LISTEN', 'TINSEL', 'ENLIST', 'All of these'], answer: 'All of these', type: 'word' },
  { q: 'Which word means “happy”?', options: ['Gloomy', 'Joyful', 'Bitter', 'Weary'], answer: 'Joyful', type: 'word' },
  { q: 'Opposite of “hot”?', options: ['Warm', 'Cool', 'Cold', 'Icy'], answer: 'Cold', type: 'word' },
  { q: 'What is 25% of 200?', options: ['25', '40', '50', '75'], answer: '50', type: 'math' },
  { q: 'Square root of 64?', options: ['6', '7', '8', '9'], answer: '8', type: 'math' },
  { q: 'What year did WWII end?', options: ['1943', '1945', '1947', '1950'], answer: '1945', type: 'trivia' },
  { q: 'Chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], answer: 'Au', type: 'trivia' },
  { q: 'Fastest land animal?', options: ['Lion', 'Cheetah', 'Horse', 'Leopard'], answer: 'Cheetah', type: 'trivia' },
];

const prizePool = [
  { prize: 50, tickets: 100 },
  { prize: 100, tickets: 150 },
  { prize: 250, tickets: 300 },
  { prize: 500, tickets: 600 },
  { prize: 100, tickets: 150 },
  { prize: 250, tickets: 300 },
];

const categoryLabels = ['prize-draws', 'instant-wins', 'jackpot', 'new-games'];
const tagLabels = ['Prize Draws', 'Instant Wins', 'Jackpot', 'New Game'];
const images = [placeholders.cash, placeholders.cashCoins, placeholders.tech, placeholders.ipad, placeholders.hairDryer, placeholders.vacuum, placeholders.holiday, placeholders.scratch];

function daysFromNow(d) {
  const x = new Date();
  x.setDate(x.getDate() + d);
  x.setHours(21, 0, 0, 0);
  return x.toISOString();
}

export const COMPETITIONS = Array.from({ length: 50 }).map((_, i) => {
  const pool = prizePool[i % prizePool.length];
  const catIdx = i % 4;
  const q = QBANK[i % QBANK.length];
  const isBig = pool.prize >= 250;
  return {
    id: `c${i + 1}`,
    slug: `contest-${i + 1}`,
    title: `Win £${pool.prize} Cash – Contest #${i + 1}`,
    subtitle: isBig ? `£${pool.prize} tax-free cash prize` : `£${pool.prize} cash prize`,
    category: categoryLabels[catIdx],
    tag: tagLabels[catIdx],
    price: 1.00,
    ticketsSold: 0,
    ticketsTotal: pool.tickets,
    prizeAmount: pool.prize,
    endDate: daysFromNow(3 + (i % 14)),
    image: images[i % images.length],
    jackpot: isBig,
    featured: i < 3,
    skillQuestion: q,
  };
});

// Empty on launch - populated as real winners come in
export const WINNERS = [];
export const STORIES = [];
export const REVIEWS = [];

export const HOW_IT_WORKS = [
  { step: 1, title: 'Pick a contest', desc: 'Browse 50 live skill contests and pick one you fancy.' },
  { step: 2, title: 'Solve the skill puzzle', desc: 'Answer a genuine skill question – math, trivia, or word puzzle.' },
  { step: 3, title: 'Buy your ticket', desc: 'Pay just £1 per entry via card, Apple Pay or Google Pay.' },
  { step: 4, title: 'Winner announced live', desc: 'Draw is broadcast live – winners paid or shipped within 24h.' },
];

export const FAQ_ITEMS = [
  { q: 'Is Prize League gambling?', a: 'No. Prize League is a UK skill-based prize competition platform. Every entry requires you to correctly answer a genuine skill question. Entries with an incorrect answer are excluded from the draw, which places us outside the Gambling Act 2005 under the “skill-competition” exemption.' },
  { q: 'How do I enter a contest?', a: 'Pick a contest, correctly answer the skill question, choose the number of tickets you want, and pay £1 per entry at checkout.' },
  { q: 'When are the draws?', a: 'Every contest has a published draw date and time on its page. All draws are live-streamed on our Production channel.' },
  { q: 'Is there a free entry route?', a: 'Yes – UK law requires a free postal entry alternative. Details are printed on every contest page under “Free Entry”.' },
  { q: 'How do winners get paid?', a: 'Cash prizes are transferred to your bank account within 24 hours of the draw. Physical prizes ship free within 5 working days.' },
  { q: 'What happens if I answer wrong?', a: 'Incorrect answers are excluded from the prize draw, so please double-check before submitting. This is what makes Prize League a skill contest rather than a lottery.' },
  { q: 'Who can enter?', a: 'You must be 18+ and a UK resident. Verification may be required before payout.' },
  { q: 'How do I contact support?', a: 'Email support@prizeleague.co.uk – we typically reply within one business day.' },
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

// Admin data - empty for real launch
export const ADMIN_USERS = [];
export const ADMIN_ORDERS = [];
export const REVENUE_SERIES = [
  { m: 'Jan', revenue: 0, tickets: 0 },
  { m: 'Feb', revenue: 0, tickets: 0 },
  { m: 'Mar', revenue: 0, tickets: 0 },
  { m: 'Apr', revenue: 0, tickets: 0 },
  { m: 'May', revenue: 0, tickets: 0 },
  { m: 'Jun', revenue: 0, tickets: 0 },
  { m: 'Jul', revenue: 0, tickets: 0 },
];
export const PRODUCTION_TASKS = [];
export const PRIZE_INVENTORY = COMPETITIONS.slice(0, 8).map((c, i) => ({
  id: `p${i+1}`, name: c.title, stock: 1, allocated: 0, retail: c.prizeAmount, category: 'Cash',
}));
