import { DashboardResponse, ProjectSummary, UserRole } from "../types";
import { delay, mockDashboardByRole } from "./mockData";

export type DashboardProject = ProjectSummary;
export type { DashboardResponse };

export const dashboardService = {
  async getDashboard(role: UserRole): Promise<DashboardResponse> {
    return delay(mockDashboardByRole[role]);
  },
};
