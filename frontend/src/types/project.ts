export type ProjectStatus = "draft" | "active" | "assessing" | "completed";

export interface Project {
  id: string;
  name: string;
  repositoryUrl: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}
