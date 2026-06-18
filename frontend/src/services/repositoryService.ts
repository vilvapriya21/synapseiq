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
  entry_type:
    | "file_tree"
    | "readme"
    | "dependencies"
    | "module_summary"
    | "function_index"
    | "source_file"
    | "image_file";
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

export interface RepositoryFileResponse {
  repository_id: string;
  path: string;
  entry_type: "source_file" | "image_file";
  content: string;
  mime_type?: string;
  size: number;
}

export interface RepositoryUpload {
  id: string;
  filename: string;
  content_type?: string;
  size: number;
  uploaded_at: string;
  uploaded_by: string;
}

export interface RepositoryUploadListResponse {
  uploads: RepositoryUpload[];
  total: number;
}

export interface Contributor {
  id: string;
  name: string;
  email: string;
  commit_count: number;
  top_files?: string;
}

export interface ContributorListResponse {
  repository_id: string;
  contributors: Contributor[];
  total: number;
}

export interface KTTopic {
  id: string;
  repository_id: string;
  title: string;
  description?: string;
  path_patterns?: string;
  created_at: string;
}

export interface KTTopicListResponse {
  topics: KTTopic[];
  total: number;
}

export interface Assignment {
  id: string;
  repository_id: string;
  kt_topic_id?: string;
  kt_topic_title?: string;
  learner_id: string;
  learner_name: string;
  learner_email: string;
  status: string;
  assigned_at: string;
}

export interface AssignmentListResponse {
  assignments: Assignment[];
  total: number;
}

export interface MyAssignment {
  assignment_id: string;
  repository_id: string;
  repository_name: string;
  kt_topic_id?: string;
  kt_topic_title?: string;
  kt_topic_description?: string;
  status: string;
  assigned_at: string;
}

export interface RecommendedContributor {
  name: string;
  email: string;
  commit_count: number;
  relevant_file_matches: number;
}

export interface TopicRecommendationResponse {
  kt_topic_id: string;
  kt_topic_title: string;
  recommendations: RecommendedContributor[];
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  total: number;
}

export interface ChatMessageResponse {
  user_message?: ChatMessage;
  assistant_message: ChatMessage;
}

export interface ChecklistItem {
  id: string;
  kt_topic_id: string;
  title: string;
  description?: string | null;
  order: number;
  created_at: string;
  completed: boolean;
  completed_at?: string | null;
}

export interface ChecklistListResponse {
  items: ChecklistItem[];
  total: number;
}

export interface ChecklistItemCreate {
  title: string;
  description?: string | null;
}

export interface ChecklistItemUpdate {
  title?: string;
  description?: string | null;
  order?: number;
}

export const connectRepository = async (
  url: string,
  branch: string,
  provider?: string,
): Promise<Repository> => {
  const { data } = await apiClient.post<Repository>("/repositories/connect", {
    url,
    branch,
    ...(provider ? { provider, source_type: provider } : {}),
  });
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

export const getRepositoryAssignments = async (repoId: string): Promise<Assignment[]> => {
  const response = await apiClient.get<AssignmentListResponse>(`/repositories/${repoId}/assignments`);
  return response.data.assignments;
};

export const assignLearner = async (repoId: string, learnerId: string, ktTopicId?: string): Promise<Assignment> => {
  const response = await apiClient.post<Assignment>(`/repositories/${repoId}/assignments`, {
    kt_topic_id: ktTopicId,
    learner_id: learnerId,
  });
  return response.data;
};

export const unassignLearner = async (repoId: string, assignmentId: string): Promise<void> => {
  await apiClient.delete(`/repositories/${repoId}/assignments/${assignmentId}`);
};

export async function getKnowledgeBase(repoId: string, entryType?: string): Promise<KnowledgeBaseResponse> {
  const params = entryType ? `?entry_type=${entryType}` : "";
  const { data } = await apiClient.get<KnowledgeBaseResponse>(`/repositories/${repoId}/knowledge-base${params}`);
  return data;
}

export async function getRepositoryFile(repoId: string, path: string): Promise<RepositoryFileResponse> {
  const { data } = await apiClient.get<RepositoryFileResponse>(`/repositories/${repoId}/files`, {
    params: { path },
  });
  return data;
}

export async function getRepositoryUploads(repoId: string): Promise<RepositoryUploadListResponse> {
  const { data } = await apiClient.get<RepositoryUploadListResponse>(`/repositories/${repoId}/uploads`);
  return data;
}

export async function uploadRepositoryDocument(repoId: string, file: File): Promise<RepositoryUpload> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post<RepositoryUpload>(`/repositories/${repoId}/uploads`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deleteRepositoryUpload(repoId: string, uploadId: string): Promise<void> {
  await apiClient.delete(`/repositories/${repoId}/uploads/${uploadId}`);
}

export async function downloadRepositoryUpload(repoId: string, upload: RepositoryUpload): Promise<void> {
  const response = await apiClient.get<Blob>(`/repositories/${repoId}/uploads/${upload.id}/download`, {
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = upload.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function getContributors(repoId: string): Promise<ContributorListResponse> {
  const { data } = await apiClient.get<ContributorListResponse>(`/repositories/${repoId}/contributors`);
  return data;
}

export async function analyzeContributors(repoId: string): Promise<ContributorListResponse> {
  const { data } = await apiClient.post<ContributorListResponse>(`/repositories/${repoId}/analyze-contributors`);
  return data;
}

export const createKTTopic = async (
  repoId: string,
  data: { title: string; description?: string; path_patterns?: string },
): Promise<KTTopic> => {
  const response = await apiClient.post<KTTopic>(`/repositories/${repoId}/kt-topics`, data);
  return response.data;
};

export const getKTTopics = async (repoId: string): Promise<KTTopicListResponse> => {
  const response = await apiClient.get<KTTopicListResponse>(`/repositories/${repoId}/kt-topics`);
  return response.data;
};

export const deleteKTTopic = async (repoId: string, topicId: string): Promise<void> => {
  await apiClient.delete(`/repositories/${repoId}/kt-topics/${topicId}`);
};

export const getAssignments = async (repoId: string): Promise<AssignmentListResponse> => {
  const response = await apiClient.get<AssignmentListResponse>(`/repositories/${repoId}/assignments`);
  return response.data;
};

export const getMyAssignments = async (): Promise<MyAssignment[]> => {
  const response = await apiClient.get<MyAssignment[]>("/repositories/assigned-to-me");
  return response.data;
};

export const getTopicRecommendation = async (
  repoId: string,
  topicId: string,
): Promise<TopicRecommendationResponse> => {
  const response = await apiClient.get<TopicRecommendationResponse>(
    `/repositories/${repoId}/kt-topics/${topicId}/recommend`,
  );
  return response.data;
};

export const getChatHistory = async (repoId: string): Promise<ChatHistoryResponse> => {
  const response = await apiClient.get<ChatHistoryResponse>(`/repositories/${repoId}/chat`);
  return response.data;
};

export const postChatMessage = async (repoId: string, content: string): Promise<ChatMessageResponse> => {
  const response = await apiClient.post<ChatMessageResponse>(`/repositories/${repoId}/chat`, { content });
  return response.data;
};

export const getChecklist = async (repoId: string, topicId: string): Promise<ChecklistListResponse> => {
  const response = await apiClient.get<ChecklistListResponse>(
    `/repositories/${repoId}/kt-topics/${topicId}/checklist`,
  );
  return response.data;
};

export const addChecklistItem = async (
  repoId: string,
  topicId: string,
  data: ChecklistItemCreate,
): Promise<ChecklistItem> => {
  const response = await apiClient.post<ChecklistItem>(
    `/repositories/${repoId}/kt-topics/${topicId}/checklist`,
    data,
  );
  return response.data;
};

export const updateChecklistItem = async (
  repoId: string,
  topicId: string,
  itemId: string,
  data: ChecklistItemUpdate,
): Promise<ChecklistItem> => {
  const response = await apiClient.patch<ChecklistItem>(
    `/repositories/${repoId}/kt-topics/${topicId}/checklist/${itemId}`,
    data,
  );
  return response.data;
};

export const deleteChecklistItem = async (repoId: string, topicId: string, itemId: string): Promise<void> => {
  await apiClient.delete(`/repositories/${repoId}/kt-topics/${topicId}/checklist/${itemId}`);
};

export const regenerateChecklist = async (repoId: string, topicId: string): Promise<ChecklistListResponse> => {
  const response = await apiClient.post<ChecklistListResponse>(
    `/repositories/${repoId}/kt-topics/${topicId}/checklist/regenerate`,
  );
  return response.data;
};

export const completeChecklistItem = async (
  repoId: string,
  topicId: string,
  itemId: string,
): Promise<ChecklistItem> => {
  const response = await apiClient.post<ChecklistItem>(
    `/repositories/${repoId}/kt-topics/${topicId}/checklist/${itemId}/complete`,
  );
  return response.data;
};

export const uncompleteChecklistItem = async (repoId: string, topicId: string, itemId: string): Promise<void> => {
  await apiClient.delete(`/repositories/${repoId}/kt-topics/${topicId}/checklist/${itemId}/complete`);
};

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
