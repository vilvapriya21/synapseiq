import { ProjectSummary } from "../types";
import { delay, mockProjects } from "./mockData";

export const projectService = {
  async getProjects(): Promise<ProjectSummary[]> {
    return delay(mockProjects);
  },

  async getProject(projectId: string): Promise<ProjectSummary | null> {
    return delay(mockProjects.find((project) => project.id === projectId) ?? null);
  },
};
