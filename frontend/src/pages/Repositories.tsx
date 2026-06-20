import { Navigate } from "react-router-dom";
import RepositoryOnboardPage from "./RepositoryOnboard";
import LearnerRepositories from "./LearnerRepositories";
import { ROUTES } from "../routes/routePaths";
import { useAuthStore } from "../store/authStore";
import { normalizeRole } from "../utils/roles";

function RepositoriesPage() {
  const user = useAuthStore((state) => state.user);
  const role = normalizeRole(user?.role ?? "");

  if (role === "ADMIN") {
    return <RepositoryOnboardPage />;
  }

  if (role === "LEARNER") {
    return <LearnerRepositories />;
  }

  return <Navigate to={ROUTES.dashboard} replace />;
}

export default RepositoriesPage;
