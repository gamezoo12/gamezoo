import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// UI guard only; the API enforces Super Admin independently with HTTP 403.
export default function RequireSuperAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role !== 'super_admin') return <Navigate to="/admin" replace />;
  return children;
}
