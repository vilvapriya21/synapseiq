import apiClient from "./api";

export interface DashboardStats {
  totalRepositories: number;
  indexedRepositories: number;
  pendingRepositories: number;
  knowledgeBasesReady: number;
}

export interface DashboardProject {
  id: string;
  name: string;
  repository: string;
  provider: string;
  status: string;
  language: string;
  module_count: number;
  file_count: number;
  knowledge_base_status: string;
  branch: string;
  created_at: string;
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
