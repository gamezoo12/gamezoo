import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import './App.css';
import { Toaster } from './components/ui/toaster';
import { AuthProvider } from './context/AuthContext';

import PublicLayout from './components/layout/PublicLayout';
import Home from './pages/Home';
import Competitions from './pages/Competitions';
import CompetitionDetail from './pages/CompetitionDetail';
import Winners from './pages/Winners';
import DrawCentre from './pages/DrawCentre';
import Stories from './pages/Stories';
import FAQ from './pages/FAQ';
import Login from './pages/Login';
import MyAccount from './pages/MyAccount';
import Cart from './pages/Cart';
import AuthCallback from './pages/AuthCallback';
import FreeEntry from './pages/FreeEntry';
import AdminLogin from './pages/AdminLogin';

import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/UsersPage';
import AdminCompetitions from './pages/admin/CompetitionsAdmin';
import AdminOrders from './pages/admin/OrdersPage';
import AdminWinners from './pages/admin/WinnersAdmin';
import WinnerSelectionAdmin from './pages/admin/WinnerSelectionAdmin';
import AdminAnalytics from './pages/admin/AnalyticsPage';
import AdminKyc from './pages/admin/KycPage';
import AdminPayments from './pages/admin/PaymentsPage';
import AdminSettings from './pages/admin/SettingsPage';
import AdminRoles from './pages/admin/RolesPage';
import AdminWallets from './pages/admin/WalletAdmin';
import AdminGames from './pages/admin/GamesAdmin';
import AdminAuditLogs from './pages/admin/AuditLogsPage';
import PlayGame from './pages/PlayGame';
import ContestLeaderboard from './pages/ContestLeaderboard';
import GlobalLeaderboard from './pages/GlobalLeaderboard';
import HowItWorksPage from './pages/HowItWorks';
import ReferPage from './pages/ReferPage';
import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import WebsiteTermsPage from './pages/legal/WebsiteTermsPage';
import MobileTermsPage from './pages/legal/MobileTermsPage';

import ProductionLayout from './components/admin/ProductionLayout';
import LiveDrawPage from './pages/production/LiveDraw';
import PrizeInventory from './pages/production/PrizeInventory';
import OperationsPage from './pages/production/Operations';
import WinnersFeed from './pages/production/WinnersFeed';

function AppRouter() {
  const location = useLocation();
  if (location.hash && location.hash.includes('session_id=')) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/competitions" element={<Competitions />} />
        <Route path="/competition/:slug" element={<CompetitionDetail />} />
        <Route path="/winners" element={<Winners />} />
        <Route path="/draw-results" element={<DrawCentre />} />
        <Route path="/draw-centre" element={<DrawCentre />} />
        <Route path="/stories" element={<Stories />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/login" element={<Login />} />
        <Route path="/my-account" element={<MyAccount />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/free-entry" element={<FreeEntry />} />
        <Route path="/play/:contestId/:ticketId" element={<PlayGame />} />
        <Route path="/leaderboard" element={<GlobalLeaderboard />} />
        <Route path="/leaderboard/:contestId" element={<ContestLeaderboard />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/refer" element={<ReferPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/website-terms" element={<WebsiteTermsPage />} />
        <Route path="/mobile-terms" element={<MobileTermsPage />} />
      </Route>

      <Route path="/admin/login" element={<AdminLogin />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="kyc" element={<AdminKyc />} />
        <Route path="competitions" element={<AdminCompetitions />} />
        <Route path="games" element={<AdminGames />} />
        <Route path="wallets" element={<AdminWallets />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="winners" element={<AdminWinners />} />
        <Route path="winner-selection" element={<WinnerSelectionAdmin />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="roles" element={<AdminRoles />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
      </Route>

      <Route path="/production" element={<ProductionLayout />}>
        <Route index element={<OperationsPage />} />
        <Route path="live-draw" element={<LiveDrawPage />} />
        <Route path="inventory" element={<PrizeInventory />} />
        <Route path="winners" element={<WinnersFeed />} />
        <Route path="kyc" element={<AdminKyc />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
