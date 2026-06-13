import apiClient from "./api";

export interface DashboardStats {
  totalProjects: number;
  activeKtPlans: number;
  pendingAssessments: number;
  completedAssessments: number;
}

export interface DashboardProject {
  id: string;
  name: string;
  repository: string;
  status: "Active" | "Review" | "Pending" | "Completed";
  ktProgress: number;
  assessmentScore: number;
}

export interface DashboardResponse {
  stats: DashboardStats;
  projects: DashboardProject[];
}

export const dashboardService = {
  async getDashboard() {
    const { data } = await apiClient.get<DashboardResponse>("/dashboard");
    return data;
  },
};
