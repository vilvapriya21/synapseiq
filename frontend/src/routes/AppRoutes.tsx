import { Navigate, Route, Routes } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import LoginPage from "../pages/Login";
import AdminUsersPage from "../pages/AdminUsers";
import DashboardPage from "../pages/Dashboard";
import RepositoryPage from "../pages/Repository";
import RepositoryOnboardPage from "../pages/RepositoryOnboard";
import ProjectPage from "../pages/Project";
import AssessmentPage from "../pages/Assessment";
import AssessmentBuilder from "../pages/AssessmentBuilder";
import AssessmentResults from "../pages/AssessmentResults";
import AssessmentsPage from "../pages/Assessments";
import AttemptDetail from "../pages/AttemptDetail";
import ResultsPage from "../pages/Results";
import ProtectedRoute from "./ProtectedRoute";
import RoleRoute from "./RoleRoute";
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
          <Route path={ROUTES.projectWorkspace} element={<ProjectPage />} />
          <Route path={ROUTES.assessments} element={<AssessmentsPage />} />
          <Route path={ROUTES.project} element={<ProjectPage />} />
          <Route path={ROUTES.projectResults} element={<ResultsPage />} />
          <Route path={ROUTES.repositoryDetail} element={<RepositoryPage />} />

          <Route element={<RoleRoute allowedRoles={["ADMIN"]} />}>
            <Route path={ROUTES.adminUsers} element={<AdminUsersPage />} />
            <Route path={ROUTES.repositories} element={<RepositoryOnboardPage />} />
            <Route path={ROUTES.repositoryOnboard} element={<RepositoryOnboardPage />} />
            <Route path={ROUTES.assessmentBuild} element={<AssessmentBuilder />} />
            <Route path={ROUTES.assessmentResults} element={<AssessmentResults />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={["LEARNER"]} />}>
            <Route path={ROUTES.assessmentTake} element={<AssessmentPage />} />
            <Route path={ROUTES.assessmentMyResult} element={<AttemptDetail />} />
          </Route>

          <Route path={ROUTES.attemptDetail} element={<AttemptDetail />} />
          <Route element={<RoleRoute allowedRoles={["ADMIN", "LEARNER"]} />}>
            <Route path={ROUTES.projectAssessment} element={<Navigate to={ROUTES.assessments} replace />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
    </Routes>
  );
}

export default AppRoutes;
