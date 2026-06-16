import apiClient from "./api";

export interface Repository {
  id: string;
  name: string;
  source_type: "git" | "upload";
  provider?: string;
  url?: string;
  branch?: string;
  language?: string;
  module_count: number;
  file_count?: number;
  status: "pending" | "indexing" | "indexed" | "error";
  knowledge_base_status?: "none" | "building" | "ready" | "error";
  error_message?: string;
  created_at: string;
}

export interface RepositoryListResponse {
  repositories: Repository[];
  total: number;
}

export interface RepositoryAnalysis {
  status: "mock-generated";
  contributors: Array<{ name: string; commits: number }>;
  metrics: Array<{ label: string; value: string }>;
}

export interface KnowledgeBaseEntry {
  id: string;
  entry_type: "file_tree" | "readme" | "dependencies" | "module_summary" | "function_index";
  file_path?: string;
  content: string;
  language?: string;
}

export interface KnowledgeBaseResponse {
  repository_id: string;
  status: string;
  entries: KnowledgeBaseEntry[];
  total: number;
}

export interface RepositoryAssignment {
  id: string;
  name: string;
  email: string;
}

export const connectRepository = async (url: string, branch: string): Promise<Repository> => {
  const { data } = await apiClient.post<Repository>("/repositories/connect", { url, branch });
  return data;
};

export const uploadRepository = async (file: File): Promise<Repository> => {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await apiClient.post<Repository>("/repositories/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return data;
};

export const listRepositories = async (): Promise<RepositoryListResponse> => {
  const { data } = await apiClient.get<RepositoryListResponse>("/repositories");
  return data;
};

export const refreshRepository = async (repoId: string): Promise<Repository> => {
  const { data } = await apiClient.post<Repository>(`/repositories/${repoId}/refresh`);
  return data;
};

export const getRepository = async (repoId: string): Promise<Repository> => {
  const { data } = await apiClient.get<Repository>(`/repositories/${repoId}`);
  return data;
};

export const deleteRepository = async (repoId: string): Promise<void> => {
  await apiClient.delete(`/repositories/${repoId}`);
};

export const getAssignedRepositories = async (): Promise<RepositoryListResponse> => {
  const response = await apiClient.get<RepositoryListResponse>("/repositories/assigned");
  return response.data;
};

export const getRepositoryAssignments = async (repoId: string): Promise<RepositoryAssignment[]> => {
  const response = await apiClient.get<RepositoryAssignment[]>(`/repositories/${repoId}/assignments`);
  return response.data;
};

export const assignLearner = async (repoId: string, learnerId: string): Promise<void> => {
  await apiClient.post(`/repositories/${repoId}/assign`, { learner_id: learnerId });
};

export const unassignLearner = async (repoId: string, learnerId: string): Promise<void> => {
  await apiClient.delete(`/repositories/${repoId}/assign/${learnerId}`);
};

export async function getKnowledgeBase(repoId: string, entryType?: string): Promise<KnowledgeBaseResponse> {
  const params = entryType ? `?entry_type=${entryType}` : "";
  const { data } = await apiClient.get<KnowledgeBaseResponse>(`/repositories/${repoId}/knowledge-base${params}`);
  return data;
}

export const repositoryService = {
  async analyzeRepository(): Promise<RepositoryAnalysis> {
    return {
      status: "mock-generated",
      contributors: [
        { name: "Priya Menon", commits: 184 },
        { name: "Daniel Cho", commits: 139 },
      ],
      metrics: [
        { label: "Mock modules", value: "18" },
        { label: "Mock hotspots", value: "6" },
      ],
    };
  },
};
