import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ROUTES } from "./routePaths";
import { useAuthStore } from "../store/authStore";

function ProtectedRoute() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const token = useAuthStore((state) => state.tokens?.accessToken);

  if (!isAuthenticated || !token) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
