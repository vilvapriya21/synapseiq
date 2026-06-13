export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  repositories: "/repositories",
  repositoryOnboard: "/repositories/onboard",
  repository: "/repositories/:repoId",
  project: "/project/:projectId",
  projectAssessment: "/project/:projectId/assessment",
  projectResults: "/project/:projectId/results",
} as const;
