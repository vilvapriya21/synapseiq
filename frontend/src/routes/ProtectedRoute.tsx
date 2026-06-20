import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ROUTES } from "./routePaths";
import { authService } from "../services/authService";
import { useAuthStore } from "../store/authStore";

function ProtectedRoute() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const token = useAuthStore((state) => state.tokens?.accessToken);
  const setUser = useAuthStore((state) => state.setUser);
  const [isCheckingUser, setIsCheckingUser] = useState(Boolean(isAuthenticated && token));

  useEffect(() => {
    let isMounted = true;

    if (!isAuthenticated || !token) {
      setIsCheckingUser(false);
      return;
    }

    setIsCheckingUser(true);
    authService
      .me()
      .then((user) => {
        if (isMounted) setUser(user);
      })
      .finally(() => {
        if (isMounted) setIsCheckingUser(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, setUser, token]);

  if (!isAuthenticated || !token) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }

  if (isCheckingUser) {
    return null;
  }

  return <Outlet />;
}

export default ProtectedRoute;
