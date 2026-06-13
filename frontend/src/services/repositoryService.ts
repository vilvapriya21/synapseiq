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

export async function getKnowledgeBase(
  repoId: string,
  entryType?: string
): Promise<KnowledgeBaseResponse> {
  const params = entryType ? `?entry_type=${entryType}` : "";
  const response = await apiClient.get<KnowledgeBaseResponse>(
    `/repositories/${repoId}/knowledge-base${params}`
  );
  return response.data;
}
