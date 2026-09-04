import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { UserRole } from "../types";
import { hasAllowedRole } from "../utils/roles";
import { ROUTES } from "./routePaths";

interface RoleRouteProps {
  allowedRoles: UserRole[];
}

function RoleRoute({ allowedRoles }: RoleRouteProps) {
  const user = useAuthStore((state) => state.user);
  const roles = user?.role ? [user.role] : [];
  const isAllowed = hasAllowedRole(roles, allowedRoles);

  if (!isAllowed) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  return <Outlet />;
}

export default RoleRoute;
