import apiClient from "./api";

export interface Repository {
  id: string;
  name: string;
  source_type: "github" | "upload";
  url?: string;
  branch?: string;
  language?: string;
  module_count: number;
  status: "pending" | "indexing" | "indexed" | "error";
  error_message?: string;
  created_at: string;
}

export interface RepositoryListResponse {
  repositories: Repository[];
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
