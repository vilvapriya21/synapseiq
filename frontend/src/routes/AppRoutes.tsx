import { Navigate, Route, Routes } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import LoginPage from "../pages/Login";
import DashboardPage from "../pages/Dashboard";
import RepositoryOnboardPage from "../pages/RepositoryOnboard";
import ProjectPage from "../pages/Project";
import AssessmentPage from "../pages/Assessment";
import ResultsPage from "../pages/Results";
import ProtectedRoute from "./ProtectedRoute";
import { ROUTES } from "./routePaths";

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/" element={<LoginPage />} />
        <Route path={ROUTES.login} element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path={ROUTES.dashboard} element={<DashboardPage />} />
          <Route path={ROUTES.repositoryOnboard} element={<RepositoryOnboardPage />} />
          <Route path={ROUTES.project} element={<ProjectPage />} />
          <Route path={ROUTES.projectAssessment} element={<AssessmentPage />} />
          <Route path={ROUTES.projectResults} element={<ResultsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
    </Routes>
  );
}

export default AppRoutes;
