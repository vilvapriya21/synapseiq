export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  adminUsers: "/admin/users",
  repositories: "/repositories",
  repositoryOnboard: "/repositories/onboard",
  repository: "/repositories/:repoId",
  repositoryDetail: "/repositories/:repoId",
  project: "/project/:projectId",
  projectAssessment: "/project/:projectId/assessment",
  projectResults: "/project/:projectId/results",
} as const;
