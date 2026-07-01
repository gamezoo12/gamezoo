// Mock data for Prize Paradise clone

export const HERO_SLIDES = [
  {
    id: 1,
    title: 'Win £35,000 Tax Free Cash',
    subtitle: 'Over £20k In Instants • Draw Mon 3rd Aug',
    cta: 'Enter Now',
    href: '/competition/win-35000-cash',
    image: 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    accent: 'from-teal-500 to-emerald-500',
  },
  {
    id: 2,
    title: 'Cars & Cash Instant Mania',
    subtitle: 'Our first ever car instant win competition – £2,000 End Prize',
    cta: 'Play Now',
    href: '/competition/cars-and-cash',
    image: 'https://images.pexels.com/photos/19240616/pexels-photo-19240616.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    accent: 'from-orange-500 to-rose-500',
  },
  {
    id: 3,
    title: 'Sign Up & Get 10 Free Spins',
    subtitle: 'Our famous colour wheel draw is now online – Free for new players',
    cta: 'Claim Free Spins',
    href: '/register',
    image: 'https://images.unsplash.com/photo-1527269534026-c86f4009eace?auto=format&fit=crop&w=1600&q=80',
    accent: 'from-amber-400 to-pink-500',
  },
];

export const SITE_STATS = [
  { label: 'Lucky Winners', value: '85,000+', icon: 'Trophy' },
  { label: 'Given Out In Prizes', value: '£22m+', icon: 'BadgePoundSterling' },
  { label: 'Social Followers', value: '165k+', icon: 'Users' },
  { label: 'Winners Today', value: '518', icon: 'Sparkles' },
  { label: 'Won In Prizes Today', value: '£2,895.60', icon: 'Coins' },
];

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

export const COMPETITIONS = [
  {
    id: 'c1', slug: '1-in-4-chance', title: '1 In 4 Chance To Win – £500 End Prize',
    subtitle: 'Scratch & Win!', category: 'instant-wins', tag: 'Draw Today',
    price: 2.00, ticketsSold: 2907, ticketsTotal: 8000, endDate: hoursFromNow(6),
    image: placeholders.scratch, jackpot: false, featured: true,
  },
  {
    id: 'c2', slug: 'win-3000-for-30p', title: 'Win £3,000 For 30p!',
    subtitle: 'Prize Draws', category: 'prize-draws', tag: 'Draw Today',
    price: 0.30, ticketsSold: 7081, ticketsTotal: 19992, endDate: hoursFromNow(6),
    image: placeholders.cash, jackpot: true,
  },
  {
    id: 'c3', slug: 'shark-cryoglow', title: 'Shark CryoGlow Mask',
    subtitle: '£250 Cash Alternative!', category: 'prize-draws', tag: 'Draw Today',
    price: 1.25, ticketsSold: 275, ticketsTotal: 480, endDate: hoursFromNow(7),
    image: placeholders.hairDryer, jackpot: false,
  },
  {
    id: 'c4', slug: 'dyson-airstrait', title: 'Dyson Airstrait',
    subtitle: '£275 Cash Alternative!', category: 'prize-draws', tag: 'Draw Today',
    price: 1.25, ticketsSold: 338, ticketsTotal: 552, endDate: hoursFromNow(8),
    image: placeholders.hairDryer, jackpot: false,
  },
  {
    id: 'c5', slug: 'grab-a-monkey', title: 'Grab A Monkey – 10 x £500 Instants',
    subtitle: 'Auto-Draw', category: 'instant-wins', tag: 'Auto-Draw',
    price: 0.50, ticketsSold: 3976, ticketsTotal: 22000, endDate: hoursFromNow(25),
    image: placeholders.tech, jackpot: false,
  },
  {
    id: 'c6', slug: 'angel-numbers', title: 'Angel Numbers – Win Up To £1,111 Instantly!',
    subtitle: '£1,111 End Prize', category: 'instant-wins', tag: 'Angel Flips',
    price: 0.11, ticketsSold: 81480, ticketsTotal: 205000, endDate: hoursFromNow(41),
    image: placeholders.cashCoins, jackpot: false,
  },
  {
    id: 'c7', slug: 'cars-and-cash', title: 'Cars & Cash Instant Mania – £2,000 End Prize',
    subtitle: 'Our First Ever Car Instant Win Comp', category: 'jackpot', tag: 'Scratch & Win!',
    price: 0.89, ticketsSold: 19267, ticketsTotal: 150000, endDate: hoursFromNow(120),
    image: placeholders.car, jackpot: true, featured: true,
  },
  {
    id: 'c8', slug: 'ultimate-prize-every-time', title: 'The Ultimate Prize Every Time – Up To £5k Instantly!',
    subtitle: '£1,000 End Prize', category: 'jackpot', tag: 'Scratch & Win!',
    price: 2.85, ticketsSold: 1084, ticketsTotal: 15000, endDate: hoursFromNow(288),
    image: placeholders.scratch, jackpot: true,
  },
  {
    id: 'c9', slug: '10000-cash', title: '£10,000 Tax Free Cash',
    subtitle: 'Prize Draws', category: 'jackpot', tag: 'Draw Wed 15th Jul',
    price: 0.20, ticketsSold: 1718, ticketsTotal: 99984, endDate: hoursFromNow(336),
    image: placeholders.cash, jackpot: true,
  },
  {
    id: 'c10', slug: 'win-35000-cash', title: 'Win £35,000 Tax Free Cash – Over £20k In Instants!',
    subtitle: 'Win Up To £2,000 Instantly!', category: 'jackpot', tag: 'Instant Wins',
    price: 0.30, ticketsSold: 8374, ticketsTotal: 385000, endDate: hoursFromNow(800),
    image: placeholders.cashCoins, jackpot: true, featured: true,
  },
  {
    id: 'c11', slug: 'win-500-for-10p', title: 'Win £500 For 10p!',
    subtitle: 'Prize Draws', category: 'prize-draws', tag: 'Draw Today',
    price: 0.10, ticketsSold: 4594, ticketsTotal: 9984, endDate: hoursFromNow(6),
    image: placeholders.cash, jackpot: false,
  },
  {
    id: 'c12', slug: 'greek-holiday', title: 'Greek Island Getaway £5,000 Package',
    subtitle: 'Holiday', category: 'prize-draws', tag: 'Draw Fri 10th Jul',
    price: 1.99, ticketsSold: 490, ticketsTotal: 2500, endDate: hoursFromNow(215),
    image: placeholders.holiday, jackpot: false,
  },
];

function hoursFromNow(h) {
  const d = new Date();
  d.setHours(d.getHours() + h);
  return d.toISOString();
}

export const WINNERS = [
  { id: 'w1', name: 'Bethany L.', prize: 'Win £2,000 For 99p!', amount: '£2,000', ticket: '80', date: '2026-06-24T21:00:00Z', image: placeholders.cash },
  { id: 'w2', name: 'Ewelina S.', prize: '£4,000 Tax Free Cash', amount: '£4,000', ticket: '58', date: '2026-06-22T21:00:00Z', image: placeholders.cashCoins },
  { id: 'w3', name: 'Roxanne H.', prize: '£2,000 End Prize - Prizes Vault', amount: '£2,000', ticket: '17066', date: '2026-06-22T21:00:00Z', image: placeholders.tech },
  { id: 'w4', name: 'Chelsea B.', prize: '£2,000 Cash', amount: '£2,000', ticket: '58050', date: '2026-06-19T18:12:00Z', image: placeholders.cash },
  { id: 'w5', name: 'Denise E.', prize: '£6,000 Tax Free Cash', amount: '£6,000', ticket: '1831', date: '2026-06-19T14:00:00Z', image: placeholders.cashCoins },
  { id: 'w6', name: 'Janine M.', prize: '£5,000 Cash', amount: '£5,000', ticket: '41914', date: '2026-06-17T11:03:00Z', image: placeholders.cash },
  { id: 'w7', name: 'Tee S.', prize: '£5,000 Cash', amount: '£5,000', ticket: '113535', date: '2026-06-16T17:21:00Z', image: placeholders.cashCoins },
  { id: 'w8', name: 'Stacey H.', prize: '£2,000 Cash', amount: '£2,000', ticket: '65176', date: '2026-06-30T09:48:00Z', image: placeholders.cash },
  { id: 'w9', name: 'Derya R.', prize: '£25,000 Tax Free Cash', amount: '£25,000', ticket: '48172', date: '2026-06-29T21:00:00Z', image: placeholders.cashCoins },
  { id: 'w10', name: 'Bethany C.', prize: '£3,000 Cash', amount: '£3,000', ticket: '18229', date: '2026-06-29T18:49:00Z', image: placeholders.cash },
  { id: 'w11', name: 'Rebecca S.', prize: '£2,000 Cash', amount: '£2,000', ticket: '161838', date: '2026-06-27T20:35:00Z', image: placeholders.cash },
  { id: 'w12', name: 'Sarah Louise C.', prize: '£3,000 Tax Free Cash', amount: '£3,000', ticket: '2', date: '2026-06-26T14:00:00Z', image: placeholders.cashCoins },
];

export const STORIES = [
  { id: 's1', title: 'Is Prize Paradise Legit?', date: 'September 11, 2025', excerpt: 'It’s a fair question for players of online competitions, and one we’re happy to answer. At Paradise HQ we operate in a completely transparent environment…', image: placeholders.tech },
  { id: 's2', title: 'Lisa’s story… After The Win', date: 'August 20, 2025', excerpt: 'Lisa was a regular player of Prize Paradise online competitions but she wasn’t having the best time until a life-changing win came along…', image: placeholders.cashCoins },
  { id: 's3', title: 'How would you spend £20k?', date: 'August 7, 2025', excerpt: 'A cool £20k hitting your bank account within hours of winning a cash prize draw. With Prize Paradise it’s not such a far-fetched idea…', image: placeholders.holiday },
  { id: 's4', title: 'Dawn’s Story… After The Win', date: 'July 21, 2025', excerpt: 'Dawn was staying with her sister for a short break when she received the email—she’d won a Prize Paradise online competition…', image: placeholders.cash },
  { id: 's5', title: 'We’ve given away £20 million in prizes!', date: 'June 23, 2025', excerpt: 'It’s been a while since we launched Prize Paradise. To date, we’ve given away a whopping £20 million worth of prizes…', image: placeholders.cashCoins },
  { id: 's6', title: 'What happens to your brain when you win?', date: 'October 2, 2025', excerpt: 'Why winning online competitions does more for you than increasing your bank balance…', image: placeholders.tech },
];

export const REVIEWS = [
  { id: 'r1', name: 'Denise Edmunds', date: '19 June', rating: 5, text: 'Just won £6000. Over the moon. Spent £3. Couldn’t believe it when I got the phone call!' },
  { id: 'r2', name: 'Janine Maciver', date: '17 June', rating: 5, text: 'Very easy app to use. I have won multiple times and the money is always transferred quickly.' },
  { id: 'r3', name: 'Rachel Hughes', date: '11 June', rating: 5, text: 'A great site, I’ve won several times over the years of playing. Winning £5,000 changed everything.' },
  { id: 'r4', name: 'Nicola Dyson', date: '9 June', rating: 5, text: 'I’ve been playing for a while now, and even though I only had my first big win lately, it was worth it!' },
  { id: 'r5', name: 'Kristina Forman', date: '8 June', rating: 5, text: 'Amazing! Second big win from Prize Paradise. The odds are great and not too expensive.' },
  { id: 'r6', name: 'Colleen Eagle', date: '27 May', rating: 5, text: 'I won on the live draw and the money was in my account within an hour, great company!' },
  { id: 'r7', name: 'Kyle Budgen', date: '26 May', rating: 5, text: 'Excellent service. Quick and efficient payment process, winnings paid on time.' },
  { id: 'r8', name: 'Mrs Ahmed', date: '26 May', rating: 5, text: 'Won an Instant 1k in the night and the withdrawal was in my bank first thing in the morning.' },
];

export const HOW_IT_WORKS = [
  { step: 1, title: 'Pick a prize', desc: 'Create an account, then select a competition you’d like to enter.' },
  { step: 2, title: 'Select tickets', desc: 'Choose how many tickets you’d like and answer the question.' },
  { step: 3, title: 'Checkout', desc: 'In your basket, hit checkout, sign in and complete payment securely.' },
  { step: 4, title: 'Winner picked!', desc: 'Tune into our live draw or check your account to see if you’ve won!' },
];

export const FAQ_ITEMS = [
  { q: 'How do I enter a competition?', a: 'Simply pick a competition, choose the number of tickets, answer the skill question, and checkout. You’ll receive your ticket numbers by email.' },
  { q: 'When are the draws?', a: 'Live draws happen on Facebook and are also streamed via our website. Draw times are shown on each competition page.' },
  { q: 'Are the competitions legal?', a: 'Yes. Prize Paradise operates under UK skill-competition legislation and every draw is verifiable.' },
  { q: 'How are winners paid?', a: 'Cash winnings are transferred directly to your bank the same day. Physical prizes are delivered free within 5 days.' },
  { q: 'Is there a free entry route?', a: 'Yes, every competition includes a free postal entry route – details are provided on each product page.' },
  { q: 'What payment methods are accepted?', a: 'Visa, Mastercard, Apple Pay, Google Pay and PayPal.' },
  { q: 'Do you ship internationally?', a: 'Physical prizes are shipped free within the UK. International winners can request the cash alternative.' },
  { q: 'Can I get a refund?', a: 'Tickets are non-refundable once purchased. Contact support if you have any concerns and we’ll look into it.' },
];

export const NAV_LINKS = [
  { label: 'Competitions', href: '/competitions' },
  { label: 'Our Winners', href: '/winners' },
  { label: 'Draw Results', href: '/draw-results' },
  { label: 'Stories', href: '/stories' },
  { label: 'FAQs', href: '/faq' },
];

export const CATEGORIES = [
  { slug: 'all', label: 'All Competitions' },
  { slug: 'jackpot', label: 'Jackpot Prizes' },
  { slug: 'instant-wins', label: 'Instant Wins' },
  { slug: 'prize-draws', label: 'Prize Draws' },
  { slug: 'new-games', label: 'New Games' },
];

// Admin / Production mock
export const ADMIN_USERS = [
  { id: 'u1', name: 'Denise Edmunds', email: 'denise@example.com', joined: '2024-05-11', tickets: 342, spent: 128.5, status: 'active' },
  { id: 'u2', name: 'Janine Maciver', email: 'janine@example.com', joined: '2023-11-02', tickets: 1121, spent: 512.8, status: 'active' },
  { id: 'u3', name: 'Rachel Hughes', email: 'rachel@example.com', joined: '2022-09-21', tickets: 2410, spent: 998.9, status: 'vip' },
  { id: 'u4', name: 'Kyle Budgen', email: 'kyle@example.com', joined: '2025-01-14', tickets: 87, spent: 26.5, status: 'active' },
  { id: 'u5', name: 'Mrs Ahmed', email: 'ahmed@example.com', joined: '2024-08-03', tickets: 512, spent: 210.0, status: 'active' },
  { id: 'u6', name: 'Colleen Eagle', email: 'colleen@example.com', joined: '2025-04-19', tickets: 190, spent: 76.4, status: 'active' },
  { id: 'u7', name: 'Luke Fenton', email: 'luke@example.com', joined: '2024-02-08', tickets: 890, spent: 351.2, status: 'vip' },
  { id: 'u8', name: 'Paige Sophie', email: 'paige@example.com', joined: '2025-05-01', tickets: 65, spent: 18.9, status: 'suspended' },
];

export const ADMIN_ORDERS = [
  { id: 'o1001', user: 'Denise Edmunds', competition: 'Win £3,000 For 30p!', tickets: 25, total: 7.5, date: '2026-07-01T10:14:00Z', status: 'paid' },
  { id: 'o1002', user: 'Janine Maciver', competition: 'Cars & Cash Instant Mania', tickets: 10, total: 8.9, date: '2026-07-01T09:48:00Z', status: 'paid' },
  { id: 'o1003', user: 'Rachel Hughes', competition: 'Angel Numbers', tickets: 100, total: 11.0, date: '2026-07-01T09:32:00Z', status: 'paid' },
  { id: 'o1004', user: 'Kyle Budgen', competition: 'Win £500 For 10p!', tickets: 50, total: 5.0, date: '2026-07-01T08:19:00Z', status: 'refunded' },
  { id: 'o1005', user: 'Mrs Ahmed', competition: 'Shark CryoGlow Mask', tickets: 4, total: 5.0, date: '2026-06-30T22:04:00Z', status: 'paid' },
  { id: 'o1006', user: 'Colleen Eagle', competition: 'Dyson Airstrait', tickets: 6, total: 7.5, date: '2026-06-30T21:41:00Z', status: 'paid' },
  { id: 'o1007', user: 'Luke Fenton', competition: 'Grab A Monkey', tickets: 40, total: 20.0, date: '2026-06-30T19:12:00Z', status: 'pending' },
];

export const REVENUE_SERIES = [
  { m: 'Jan', revenue: 42000, tickets: 84000 },
  { m: 'Feb', revenue: 55000, tickets: 110000 },
  { m: 'Mar', revenue: 61000, tickets: 122000 },
  { m: 'Apr', revenue: 72000, tickets: 145000 },
  { m: 'May', revenue: 88000, tickets: 176000 },
  { m: 'Jun', revenue: 96000, tickets: 192000 },
  { m: 'Jul', revenue: 104000, tickets: 210000 },
];

export const PRODUCTION_TASKS = [
  { id: 't1', prize: '£25,000 Tax Free Cash', winner: 'Derya R.', status: 'paid-out', date: '2026-06-29', notes: 'Same-day transfer completed.' },
  { id: 't2', prize: 'Shark CryoGlow Mask', winner: 'Paige Sophie', status: 'shipped', date: '2026-06-28', notes: 'Tracking: RM12345GB' },
  { id: 't3', prize: 'Dyson Airstrait', winner: 'Tee S.', status: 'packing', date: '2026-06-27', notes: 'Awaiting bubble wrap.' },
  { id: 't4', prize: '£5,000 Cash', winner: 'Janine M.', status: 'awaiting-bank-details', date: '2026-06-30', notes: 'Sent email 09:22.' },
  { id: 't5', prize: '£2,000 Cash', winner: 'Stacey H.', status: 'paid-out', date: '2026-06-30', notes: 'Instant bank transfer.' },
  { id: 't6', prize: 'Cars & Cash Instant Mania', winner: 'TBD', status: 'draw-scheduled', date: '2026-07-06', notes: 'Live draw at 9pm.' },
];

export const PRIZE_INVENTORY = [
  { id: 'p1', name: 'Dyson Airstrait', stock: 4, allocated: 2, retail: 449.99, category: 'Tech' },
  { id: 'p2', name: 'Shark CryoGlow Mask', stock: 6, allocated: 3, retail: 299.99, category: 'Beauty' },
  { id: 'p3', name: 'PlayStation 5 Pro', stock: 3, allocated: 1, retail: 699.0, category: 'Tech' },
  { id: 'p4', name: 'Apple iPad Pro 11"', stock: 2, allocated: 1, retail: 999.0, category: 'Tech' },
  { id: 'p5', name: 'Cash Reserve Pool', stock: 1, allocated: 0, retail: 125000.0, category: 'Cash' },
  { id: 'p6', name: 'Range Rover Evoque 2025', stock: 1, allocated: 1, retail: 42500.0, category: 'Cars' },
];
