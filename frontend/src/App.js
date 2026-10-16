
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import './App.css';

import { Toaster } from './components/ui/toaster';
import { Toaster as SonnerToaster } from './components/ui/sonner';

import { AuthProvider } from './context/AuthContext';

import TermsGate from './components/TermsGate';
import PhoneGate from './components/auth/PhoneGate';
import PromotionPopup from './components/PromotionPopup';
import PromotionAuthBridge from './components/PromotionAuthBridge';
import PromotionFloatingBadge from './components/PromotionFloatingBadge';
import GlobalSupportAssistant from './components/support/GlobalSupportAssistant';

import PublicLayout from './components/layout/PublicLayout';

const Home = lazy(() => import('./pages/Home'));
const Competitions = lazy(() => import('./pages/Competitions'));
const CompetitionDetail = lazy(() => import('./pages/CompetitionDetail'));
const WinnersReveal = lazy(() => import('./pages/WinnersReveal'));
const Winners = lazy(() => import('./pages/Winners'));
const DrawCentre = lazy(() => import('./pages/DrawCentre'));
const Stories = lazy(() => import('./pages/Stories'));
const FAQ = lazy(() => import('./pages/FAQ'));
const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const MyAccount = lazy(() => import('./pages/MyAccount'));
const Cart = lazy(() => import('./pages/Cart'));
import CartErrorBoundary from './components/CartErrorBoundary';
import AuthCallback from './pages/AuthCallback';
const FreeEntry = lazy(() => import('./pages/FreeEntry'));
const VerifyFeed = lazy(() => import('./pages/VerifyFeed'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));

import AdminLayout from './components/admin/AdminLayout';
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminUsers = lazy(() => import('./pages/admin/UsersPage'));
const AdminAlerts = lazy(() => import('./pages/admin/AlertsAdmin'));
const AdminCompetitions = lazy(() => import('./pages/admin/CompetitionsAdmin'));
const AdminLiveContests = lazy(() => import('./pages/admin/AdminLiveContests'));
const AdminOrders = lazy(() => import('./pages/admin/OrdersPage'));
const AdminWinners = lazy(() => import('./pages/admin/WinnersAdmin'));
const WinnerSelectionAdmin = lazy(() => import('./pages/admin/WinnerSelectionAdmin'));
const AdminAnalytics = lazy(() => import('./pages/admin/AnalyticsPage'));
const AcquisitionAdmin = lazy(() => import('./pages/admin/AcquisitionAdmin'));
import AcquisitionTracker from './components/AcquisitionTracker';
const AdminKyc = lazy(() => import('./pages/admin/KycPage'));
const AdminPayments = lazy(() => import('./pages/admin/PaymentsPage'));
const AdminSettings = lazy(() => import('./pages/admin/SettingsPage'));
const AdminRoles = lazy(() => import('./pages/admin/RolesPage'));
const AdminWallets = lazy(() => import('./pages/admin/WalletAdmin'));
const AdminGames = lazy(() => import('./pages/admin/GamesAdmin'));
const AdminLeaderboards = lazy(() => import('./pages/admin/AdminLeaderboards'));
const AdminAuditLogs = lazy(() => import('./pages/admin/AuditLogsPage'));
const AdminLegalDocs = lazy(() => import('./pages/admin/LegalDocsAdmin'));
const CompanySettingsAdmin = lazy(() => import('./pages/admin/CompanySettings'));
const PostalEntriesAdmin = lazy(() => import('./pages/admin/PostalEntriesAdmin'));
const UserDetailsPage = lazy(() => import('./pages/admin/UserDetailsPage'));
const ReferralsBonusesAdmin = lazy(() => import('./pages/admin/ReferralsBonusesAdmin'));
const FreeWorldAdmin = lazy(() => import('./pages/admin/FreeWorldAdmin'));
const SpecialChallengeAdmin = lazy(() => import('./pages/admin/SpecialChallengeAdmin'));
const WinningsPayoutsAdmin = lazy(() => import('./pages/admin/WinningsPayoutsAdmin'));
const CashOutAdmin = lazy(() => import('./pages/admin/CashOutAdmin'));
const SupportTicketsAdmin = lazy(() => import('./pages/admin/SupportTicketsAdmin'));
const PromotionAdminShell = lazy(() => import('./pages/admin/PromotionAdminShell'));
const PromotionCampaignsAdmin = lazy(() => import('./pages/admin/PromotionCampaignsAdmin'));
const PromotionCampaignsPage = lazy(() => import('./pages/PromotionCampaignsPage'));
const PromotionDrawStudio = lazy(() => import('./pages/admin/PromotionDrawStudio'));

const LegalDocPage = lazy(() => import('./pages/legal/LegalDocPage'));
const PlayGame = lazy(() => import('./pages/PlayGame'));
const GameArena = lazy(() => import('./pages/GameArena'));
const GamePreview = lazy(() => import('./pages/GamePreview'));
const ContestLeaderboard = lazy(() => import('./pages/ContestLeaderboard'));
const LeaderboardIndex = lazy(() => import('./pages/LeaderboardIndex'));
const HowItWorksPage = lazy(() => import('./pages/HowItWorks'));
const ReferPage = lazy(() => import('./pages/ReferPage'));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const WebsiteTermsPage = lazy(() => import('./pages/legal/WebsiteTermsPage'));
const MobileTermsPage = lazy(() => import('./pages/legal/MobileTermsPage'));

const PrizeLeagueWorld = lazy(() => import('./world/PrizeLeagueWorld'));
const WorldPreview = lazy(() => import('./world/WorldPreview'));
const WorldSelector = lazy(() => import('./pages/WorldSelector'));
const FreeWorldLanding = lazy(() => import('./pages/FreeWorldLanding'));
const SpecialChallenge = lazy(() => import('./pages/SpecialChallenge'));

import ProductionLayout from './components/admin/ProductionLayout';
const LiveDrawPage = lazy(() => import('./pages/production/LiveDraw'));
const PrizeInventory = lazy(() => import('./pages/production/PrizeInventory'));
const OperationsPage = lazy(() => import('./pages/production/Operations'));
const WinnersFeed = lazy(() => import('./pages/production/WinnersFeed'));


function RouteLoader() {
  return (
    <div
      data-testid="route-loader"
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
      }}
    >
      <div className="pl-route-spinner" aria-label="Loading" role="status" />
    </div>
  );
}

function GlobalPageNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const [hasPageBack, setHasPageBack] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.key]);

  useEffect(() => {
    const root = document.getElementById('root') || document.body;
    const update = () => setHasPageBack(Boolean(root.querySelector('[data-page-back-control="true"]')));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [location.key]);

  const canGoBack = window.history.length > 1;
  if (
    hasPageBack ||
    location.pathname === '/world' ||
    location.pathname === '/paid-leagues' ||
    location.pathname === '/challenge' ||
    location.hash.includes('session_id=')
  ) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => canGoBack && navigate(-1)}
      disabled={!canGoBack}
      aria-label="Back to previous page"
      title={canGoBack ? 'Back to previous page' : 'No previous page'}
      className="fixed left-4 z-[45] inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-slate-950/90 px-4 text-sm font-bold text-white shadow-lg backdrop-blur transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
      style={{
        bottom: location.pathname === '/world'
          ? 'calc(env(safe-area-inset-bottom, 0px) + 88px)'
          : 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      }}
      data-testid="global-back-button"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </button>
  );
}


function AppRouter() {
  const location = useLocation();

  /*
   * Emergent Google OAuth can return with #session_id=...
   * Handle it before normal route rendering.
   */
  if (
    location.hash &&
    location.hash.includes('session_id=')
  ) {
    return (
      <>
        <AuthCallback />
        <GlobalPageNavigation />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<RouteLoader />}>
      <Routes>

      {/* =========================
          PUBLIC / USER ROUTES
      ========================== */}

      <Route element={<PublicLayout />}>

        <Route
          path="/"
          element={<WorldSelector />}
        />

        <Route
          path="/choose-world"
          element={<WorldSelector />}
        />

        <Route
          path="/world"
          element={<PrizeLeagueWorld />}
        />

        <Route
          path="/free-world"
          element={<FreeWorldLanding />}
        />

        <Route
          path="/challenge"
          element={<SpecialChallenge />}
        />

        <Route
          path="/paid-leagues"
          element={<Home />}
        />

        <Route
          path="/competitions"
          element={<Competitions />}
        />

        <Route
          path="/competition/:slug"
          element={<CompetitionDetail />}
        />

        <Route
          path="/results/:slug"
          element={<WinnersReveal />}
        />

        <Route
          path="/winners"
          element={<Winners />}
        />

        <Route
          path="/draw-results"
          element={<DrawCentre />}
        />

        <Route
          path="/draw-centre"
          element={<DrawCentre />}
        />

        <Route
          path="/stories"
          element={<Stories />}
        />

        <Route
          path="/faq"
          element={<FAQ />}
        />

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/forgot-password"
          element={<ForgotPassword />}
        />


        {/* =========================
            USER ACCOUNT
        ========================== */}

        <Route
          path="/my-account"
          element={<MyAccount />}
        />


        {/* Promotion page */}

        <Route
          path="/my-account/promotions"
          element={<PromotionCampaignsPage />}
        />


        <Route
          path="/my-account/:section"
          element={<MyAccount />}
        />


        {/* =========================
            LEGAL
        ========================== */}

        <Route
          path="/legal/:slug"
          element={<LegalDocPage />}
        />


        {/* =========================
            CART
        ========================== */}

        <Route
          path="/cart"
          element={
            <CartErrorBoundary>
              <Cart />
            </CartErrorBoundary>
          }
        />


        {/* =========================
            FREE ENTRY
        ========================== */}

        <Route
          path="/free-entry"
          element={<FreeEntry />}
        />


        <Route
          path="/verify"
          element={<VerifyFeed />}
        />


        {/* =========================
            GAMES
        ========================== */}

        <Route
          path="/play/:contestId/:ticketId"
          element={<PlayGame />}
        />

        <Route
          path="/games"
          element={<GameArena />}
        />

        <Route
          path="/games/:gameId"
          element={<GamePreview />}
        />


        {/* =========================
            LEADERBOARDS
        ========================== */}

        <Route
          path="/leaderboard"
          element={<LeaderboardIndex />}
        />

        <Route
          path="/leaderboard/:contestId"
          element={<ContestLeaderboard />}
        />


        {/* =========================
            INFORMATION
        ========================== */}

        <Route
          path="/how-it-works"
          element={<HowItWorksPage />}
        />

        <Route
          path="/refer"
          element={<ReferPage />}
        />


        {/* =========================
            TERMS
        ========================== */}

        <Route
          path="/terms"
          element={<TermsPage />}
        />

        <Route
          path="/privacy"
          element={<PrivacyPage />}
        />

        <Route
          path="/website-terms"
          element={<WebsiteTermsPage />}
        />

        <Route
          path="/mobile-terms"
          element={<MobileTermsPage />}
        />

      </Route>


      {/* =========================
          WORLD PREVIEW
      ========================== */}

      <Route
        path="/world-preview"
        element={<WorldPreview />}
      />


      {/* =========================
          ADMIN LOGIN
      ========================== */}

      <Route
        path="/admin/login"
        element={<AdminLogin />}
      />


      {/* =========================
          GOOGLE AUTH CALLBACK
      ========================== */}

      <Route
        path="/auth-callback"
        element={<AuthCallback />}
      />


      {/* =========================
          PROMOTION DRAW STUDIO
      ========================== */}

      <Route
        path="/admin/promotion/draw-studio"
        element={<PromotionDrawStudio />}
      />


      {/* =========================
          ADMIN ROUTES
      ========================== */}

      <Route
        path="/admin"
        element={<AdminLayout />}
      >

        <Route
          index
          element={<AdminDashboard />}
        />

        <Route
          path="users"
          element={<AdminUsers />}
        />

        <Route
          path="alerts"
          element={<AdminAlerts />}
        />

        <Route
          path="referrals"
          element={<ReferralsBonusesAdmin />}
        />

        <Route
          path="kyc"
          element={<AdminKyc />}
        />

        <Route
          path="competitions"
          element={<AdminCompetitions />}
        />

        <Route
          path="live-contests"
          element={<AdminLiveContests />}
        />

        <Route
          path="games"
          element={<AdminGames />}
        />

        <Route
          path="leaderboards"
          element={<AdminLeaderboards />}
        />

        <Route
          path="free-world"
          element={<FreeWorldAdmin />}
        />

        <Route
          path="special-challenge"
          element={<SpecialChallengeAdmin />}
        />

        <Route
          path="support"
          element={<SupportTicketsAdmin />}
        />


        {/* Promotion Admin */}

        <Route
          path="promotion"
          element={<PromotionAdminShell />}
        />

        <Route
          path="promotion-campaigns"
          element={<PromotionCampaignsAdmin />}
        />


        <Route
          path="wallets"
          element={<AdminWallets />}
        />

        <Route
          path="winnings-payouts"
          element={<WinningsPayoutsAdmin />}
        />

        <Route
          path="cash-out"
          element={<CashOutAdmin />}
        />

        <Route
          path="orders"
          element={<AdminOrders />}
        />

        <Route
          path="payments"
          element={<AdminPayments />}
        />

        <Route
          path="winners"
          element={<AdminWinners />}
        />

        <Route
          path="winner-selection"
          element={<WinnerSelectionAdmin />}
        />

        <Route
          path="analytics"
          element={<AdminAnalytics />}
        />

        <Route
          path="acquisition"
          element={<AcquisitionAdmin />}
        />

        <Route
          path="roles"
          element={<AdminRoles />}
        />

        <Route
          path="settings"
          element={<AdminSettings />}
        />

        <Route
          path="audit-logs"
          element={<AdminAuditLogs />}
        />

        <Route
          path="legal"
          element={<AdminLegalDocs />}
        />

        <Route
          path="company"
          element={<CompanySettingsAdmin />}
        />

        <Route
          path="postal"
          element={<PostalEntriesAdmin />}
        />

        <Route
          path="users/:user_id"
          element={<UserDetailsPage />}
        />

      </Route>


      {/* =========================
          PRODUCTION ROUTES
      ========================== */}

      <Route
        path="/production"
        element={<ProductionLayout />}
      >

        <Route
          index
          element={<OperationsPage />}
        />

        <Route
          path="live-draw"
          element={<LiveDrawPage />}
        />

        <Route
          path="inventory"
          element={<PrizeInventory />}
        />

        <Route
          path="winners"
          element={<WinnersFeed />}
        />

        <Route
          path="kyc"
          element={<AdminKyc />}
        />

      </Route>

      </Routes>
      </Suspense>
      <GlobalPageNavigation />
    </>
  );
}


function App() {
  return (
    <div className="App">

      <AuthProvider>

        <BrowserRouter>

          {/* Acquisition tracking */}
          <AcquisitionTracker />


          {/* Handles promotion intent
              across login / signup */}
          <PromotionAuthBridge />


          {/* Main application routes */}
          <AppRouter />

          {/* Single global, route-persistent customer support assistant */}
          <GlobalSupportAssistant />


          {/* Existing global promotion popup */}
          <PromotionPopup />


          {/* NEW:
              Persistent draggable promotion badge */}
          <PromotionFloatingBadge />


          {/* Terms gate */}
          <TermsGate />

          <PhoneGate />


          {/* Toast notifications */}
          <Toaster />


          <SonnerToaster
            position="top-center"
            richColors
            closeButton
          />

        </BrowserRouter>

      </AuthProvider>

    </div>
  );
}

export default App;
