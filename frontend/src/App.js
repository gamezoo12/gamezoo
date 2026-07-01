import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import './App.css';
import { Toaster } from './components/ui/toaster';
import { AuthProvider } from './context/AuthContext';

import PublicLayout from './components/layout/PublicLayout';
import Home from './pages/Home';
import Competitions from './pages/Competitions';
import CompetitionDetail from './pages/CompetitionDetail';
import Winners from './pages/Winners';
import DrawResults from './pages/DrawResults';
import Stories from './pages/Stories';
import FAQ from './pages/FAQ';
import Login from './pages/Login';
import MyAccount from './pages/MyAccount';
import Cart from './pages/Cart';
import AuthCallback from './pages/AuthCallback';
import FreeEntry from './pages/FreeEntry';

import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/UsersPage';
import AdminCompetitions from './pages/admin/CompetitionsAdmin';
import AdminOrders from './pages/admin/OrdersPage';
import AdminWinners from './pages/admin/WinnersAdmin';
import AdminAnalytics from './pages/admin/AnalyticsPage';

import ProductionLayout from './components/admin/ProductionLayout';
import LiveDrawPage from './pages/production/LiveDraw';
import PrizeInventory from './pages/production/PrizeInventory';
import OperationsPage from './pages/production/Operations';

function AppRouter() {
  const location = useLocation();
  // Intercept Google OAuth return: URL contains #session_id=...
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
        <Route path="/draw-results" element={<DrawResults />} />
        <Route path="/stories" element={<Stories />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/login" element={<Login />} />
        <Route path="/my-account" element={<MyAccount />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/free-entry" element={<FreeEntry />} />
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="competitions" element={<AdminCompetitions />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="winners" element={<AdminWinners />} />
        <Route path="analytics" element={<AdminAnalytics />} />
      </Route>

      <Route path="/production" element={<ProductionLayout />}>
        <Route index element={<OperationsPage />} />
        <Route path="live-draw" element={<LiveDrawPage />} />
        <Route path="inventory" element={<PrizeInventory />} />
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
