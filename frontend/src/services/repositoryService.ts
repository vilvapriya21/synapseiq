import { delay } from "./mockData";

export interface RepositoryAnalysis {
  status: "mock-generated";
  contributors: Array<{ name: string; commits: number }>;
  metrics: Array<{ label: string; value: string }>;
}

export const repositoryService = {
  async analyzeRepository(): Promise<RepositoryAnalysis> {
    return delay({
      status: "mock-generated",
      contributors: [
        { name: "Priya Menon", commits: 184 },
        { name: "Daniel Cho", commits: 139 },
      ],
      metrics: [
        { label: "Mock modules", value: "18" },
        { label: "Mock hotspots", value: "6" },
      ],
    });
  },
};
