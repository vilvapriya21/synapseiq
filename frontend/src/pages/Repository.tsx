import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import axios from "axios";
import { Info } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import ChatPanel from "../components/ChatPanel";
import KTChecklist from "../components/KTChecklist";
import { EmptyState, Modal, PageHero } from "../components/common";
import Loader from "../components/common/Loader";
import { ENV } from "../constants/env";
import { ROUTES } from "../routes/routePaths";
import { getUsers, type AdminUser } from "../services/adminService";
import apiClient from "../services/api";
import {
  analyzeContributors,
  assignLearner,
  createKTTopic,
  deleteKTTopic,
  deleteRepositoryUpload,
  downloadRepositoryUpload,
  getAssignments,
  getContributors,
  getKTTopics,
  getKnowledgeBase,
  getMyAssignments,
  getRepositoryFile,
  getRepositoryUploads,
  getRepository,
  getTopicRecommendation,
  refreshRepository,
  unassignLearner,
  uploadRepositoryDocument,
  type Assignment,
  type Contributor,
  type KnowledgeBaseEntry,
  type KnowledgeBaseResponse,
  type KTTopic,
  type ProviderAuthError,
  type RepositoryProvider,
  type Repository,
  type RepositoryFileResponse,
  type RepositoryUpload,
  type RecommendedContributor,
} from "../services/repositoryService";
import { ACCESS_TOKEN_KEY, SESSION_ACCESS_TOKEN_KEY, useAuthStore } from "../store/authStore";
import { normalizeRole } from "../utils/roles";
import styles from "./Repository.module.css";

type TabKey = "file_tree" | "readme" | "dependencies" | "uploads";
type FileTreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children: FileTreeNode[];
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "file_tree", label: "File Tree" },
  { key: "readme", label: "README" },
  { key: "dependencies", label: "Dependencies" },
  { key: "uploads", label: "Uploads" },
];

const PENDING_REFRESH_REPO_KEY = "synapseiq.pendingRefreshRepoId";
const PENDING_REFRESH_PROVIDER_KEY = "synapseiq.pendingRefreshProvider";

const providerReconnectTitle: Record<RepositoryProvider, string> = {
  github: "Reconnect GitHub Account",
  gitlab: "Reconnect GitLab Account",
  bitbucket: "Reconnect Bitbucket Account",
  azure: "Provide Azure DevOps PAT",
};

const providerLabels: Record<RepositoryProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  azure: "Azure DevOps",
};

const topicAccentClasses = [
  styles.topicAccentCobalt,
  styles.topicAccentMint,
  styles.topicAccentIndigo,
  styles.topicAccentSky,
  styles.topicAccentAmber,
];

function getTopicAccentClass(index: number) {
  return topicAccentClasses[index % topicAccentClasses.length];
}

function getStatusClass(status: string) {
  switch (status) {
    case "indexed":
    case "ready":
      return styles.badgeIndexed;
    case "indexing":
    case "building":
      return styles.badgeIndexing;
    case "error":
      return styles.badgeError;
    case "pending":
    case "none":
    default:
      return styles.badgePending;
  }
}

function findEntry(entries: KnowledgeBaseEntry[], entryType: KnowledgeBaseEntry["entry_type"]) {
  return entries.find((entry) => entry.entry_type === entryType);
}

function normalizeFilePath(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function buildFileTree(content: string): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", type: "folder", children: [] };
  const paths = content
    .split(/\r?\n/)
    .map(normalizeFilePath)
    .filter(Boolean);

  paths.forEach((filePath) => {
    const parts = filePath.split("/").filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const type = index === parts.length - 1 ? "file" : "folder";
      let node = current.children.find((child) => child.name === part && child.type === type);

      if (!node) {
        node = { name: part, path, type, children: [] };
        current.children.push(node);
      }

      current = node;
    });
  });

  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(root.children);
  return root.children;
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTopFiles(topFiles?: string) {
  if (!topFiles) {
    return "-";
  }

  return topFiles
    .split(",")
    .map((entry) => entry.split(":")[0])
    .filter(Boolean)
    .slice(0, 3)
    .join(", ") || "-";
}

function getStoredAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || sessionStorage.getItem(SESSION_ACCESS_TOKEN_KEY) || "";
}

function getRefreshAuthError(error: unknown): ProviderAuthError | null {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  const detail = error.response?.data?.detail;
  if (
    error.response?.status === 409 &&
    detail &&
    (detail.code === "AUTH_REQUIRED" || detail.code === "AUTH_INVALID") &&
    ["github", "gitlab", "bitbucket", "azure"].includes(detail.provider)
  ) {
    return detail as ProviderAuthError;
  }

  return null;
}

function RepositoryPage() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const role = normalizeRole(user?.role ?? "");
  const [repository, setRepository] = useState<Repository | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseResponse | null>(null);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [analyzingContributors, setAnalyzingContributors] = useState(false);
  const [contributorError, setContributorError] = useState("");
  const [topics, setTopics] = useState<KTTopic[]>([]);
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [topicPaths, setTopicPaths] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [topicError, setTopicError] = useState("");
  const [recommendations, setRecommendations] = useState<Record<string, RecommendedContributor[]>>({});
  const [expandedChecklistTopicIds, setExpandedChecklistTopicIds] = useState<Record<string, boolean>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [learners, setLearners] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("file_tree");
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [selectedFile, setSelectedFile] = useState<RepositoryFileResponse | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [uploads, setUploads] = useState<RepositoryUpload[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [showRepositoryInfo, setShowRepositoryInfo] = useState(false);
  const [refreshAuthError, setRefreshAuthError] = useState<ProviderAuthError | null>(null);
  const [azurePat, setAzurePat] = useState("");
  const [azurePatError, setAzurePatError] = useState("");
  const [savingAzurePat, setSavingAzurePat] = useState(false);

  const fetchAssignments = async () => {
    if (!repoId || role !== "ADMIN") {
      return;
    }

    try {
      const response = await getAssignments(repoId);
      setAssignments(response.assignments);
      setAssignError("");
    } catch {
      setAssignError("Unable to load assigned learners.");
    }
  };

  const fetchAdminData = async () => {
    if (!repoId || role !== "ADMIN") {
      return;
    }

    try {
      const [contributorsResponse, topicsResponse, assignmentsResponse, usersResponse] = await Promise.all([
        getContributors(repoId),
        getKTTopics(repoId),
        getAssignments(repoId),
        getUsers(),
      ]);
      setContributors(contributorsResponse.contributors);
      setTopics(topicsResponse.topics);
      setAssignments(assignmentsResponse.assignments);
      setLearners(
        usersResponse
          .filter((candidate: AdminUser) => ["learner", "user"].includes(candidate.role.toLowerCase()))
          .map((candidate) => ({ id: candidate.id, name: candidate.name, email: candidate.email })),
      );
      setContributorError("");
      setAssignError("");
    } catch {
      setAssignError("Unable to load KT assignment data.");
    }
  };

  const fetchLearnerTopics = async () => {
    if (!repoId || role === "ADMIN") {
      return;
    }

    try {
      const rows = await getMyAssignments();
      setTopics(
        rows
          .filter((assignment) => assignment.repository_id === repoId && assignment.kt_topic_id && assignment.kt_topic_title)
          .map((assignment) => ({
            id: assignment.kt_topic_id as string,
            repository_id: assignment.repository_id,
            title: assignment.kt_topic_title as string,
            description: assignment.kt_topic_description,
            created_at: assignment.assigned_at,
          })),
      );
    } catch {
      setTopics([]);
    }
  };

  const fetchRepositoryData = async () => {
    if (!repoId) {
      return;
    }

    setLoading(true);
    try {
      const [repositoryResponse, knowledgeBaseResponse, uploadsResponse] = await Promise.all([
        getRepository(repoId),
        getKnowledgeBase(repoId),
        getRepositoryUploads(repoId),
      ]);
      setRepository(repositoryResponse);
      setKnowledgeBase(knowledgeBaseResponse);
      setUploads(uploadsResponse.uploads);
      setError("");
    } catch {
      setError("Unable to load repository details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositoryData();
    fetchAdminData();
    fetchLearnerTopics();
  }, [repoId, role]);

  useEffect(() => {
    const shouldPoll =
      repository?.status === "indexing" ||
      repository?.status === "pending" ||
      repository?.knowledge_base_status === "building";

    if (!shouldPoll) {
      return;
    }

    const timer = setTimeout(() => {
      fetchRepositoryData();
    }, 5000);

    return () => clearTimeout(timer);
  }, [repository]);

  const handleReanalyze = async () => {
    if (!repoId) {
      return;
    }

    setRefreshing(true);
    setRefreshError("");
    try {
      await refreshRepository(repoId);
      setRefreshAuthError(null);
      await fetchRepositoryData();
    } catch (err) {
      const authError = getRefreshAuthError(err);
      if (authError) {
        setRefreshAuthError(authError);
        return;
      }
      setRefreshError("Unable to refresh repository.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleProviderReconnect = () => {
    if (!repoId || !refreshAuthError || refreshAuthError.provider === "azure") {
      return;
    }

    const token = getStoredAccessToken();
    localStorage.setItem(PENDING_REFRESH_REPO_KEY, repoId);
    localStorage.setItem(PENDING_REFRESH_PROVIDER_KEY, refreshAuthError.provider);
    window.location.href = `${ENV.apiBaseUrl}/auth/${refreshAuthError.provider}?token=${encodeURIComponent(token)}`;
  };

  const handleSaveAzurePatAndRetry = async () => {
    if (!azurePat.trim()) {
      return;
    }

    setSavingAzurePat(true);
    setAzurePatError("");
    try {
      await apiClient.post(`/auth/azure/pat?pat=${encodeURIComponent(azurePat)}`);
      setAzurePat("");
      setRefreshAuthError(null);
      await handleReanalyze();
    } catch {
      setAzurePatError("Failed to save Azure DevOps PAT.");
    } finally {
      setSavingAzurePat(false);
    }
  };

  useEffect(() => {
    if (!repoId) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("retryRefresh") !== "1") {
      return;
    }

    window.history.replaceState({}, "", window.location.pathname);
    localStorage.removeItem(PENDING_REFRESH_REPO_KEY);
    localStorage.removeItem(PENDING_REFRESH_PROVIDER_KEY);
    handleReanalyze();
  }, [repoId]);

  const handleAnalyzeContributors = async () => {
    if (!repoId) {
      return;
    }

    setAnalyzingContributors(true);
    setContributorError("");
    try {
      const result = await analyzeContributors(repoId);
      setContributors(result.contributors);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      setContributorError(
        typeof detail === "string" && detail.trim()
          ? detail
          : "Failed to analyze contributors. Please check repository access and try again.",
      );
    } finally {
      setAnalyzingContributors(false);
    }
  };

  const handleCreateTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repoId) {
      return;
    }

    setCreatingTopic(true);
    setTopicError("");
    try {
      await createKTTopic(repoId, {
        title: topicTitle,
        description: topicDescription,
        path_patterns: topicPaths,
      });
      setTopicTitle("");
      setTopicDescription("");
      setTopicPaths("");
      setShowTopicForm(false);
      const result = await getKTTopics(repoId);
      setTopics(result.topics);
    } catch (err: any) {
      setTopicError(err?.response?.data?.detail || "Failed to create topic.");
    } finally {
      setCreatingTopic(false);
    }
  };

  const handleViewRecommendation = async (topicId: string) => {
    if (!repoId) {
      return;
    }

    const result = await getTopicRecommendation(repoId, topicId);
    setRecommendations((previous) => ({ ...previous, [topicId]: result.recommendations }));
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!repoId) {
      return;
    }
    if (!window.confirm("Delete this KT topic? Any assignments to it will also be removed.")) {
      return;
    }

    await deleteKTTopic(repoId, topicId);
    const result = await getKTTopics(repoId);
    setTopics(result.topics);
    await fetchAssignments();
  };

  const handleAssign = async () => {
    if (!repoId || !selectedLearnerId) {
      setAssignError("Please select a learner.");
      return;
    }

    setAssigning(true);
    setAssignError("");
    try {
      await assignLearner(repoId, selectedLearnerId, selectedTopicId || undefined);
      const result = await getAssignments(repoId);
      setAssignments(result.assignments);
      setSelectedLearnerId("");
      setSelectedTopicId("");
      setAssignError("");
    } catch (err: any) {
      setAssignError(err?.response?.data?.detail || "Failed to assign learner. They may already be assigned.");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    if (!repoId) {
      return;
    }

    await unassignLearner(repoId, assignmentId);
    const result = await getAssignments(repoId);
    setAssignments(result.assignments);
  };

  const toggleChecklist = (topicId: string) => {
    setExpandedChecklistTopicIds((current) => ({ ...current, [topicId]: !current[topicId] }));
  };

  const fetchUploads = async () => {
    if (!repoId) {
      return;
    }

    setUploadsLoading(true);
    try {
      const response = await getRepositoryUploads(repoId);
      setUploads(response.uploads);
      setUploadError("");
    } catch {
      setUploadError("Unable to load uploaded files.");
    } finally {
      setUploadsLoading(false);
    }
  };

  const handleUploadDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!repoId || !file) {
      return;
    }

    setUploadingDocument(true);
    setUploadError("");
    try {
      await uploadRepositoryDocument(repoId, file);
      await fetchUploads();
    } catch {
      setUploadError("Unable to upload this file. Check the file size and try again.");
    } finally {
      setUploadingDocument(false);
    }
  };

  const handleDeleteUpload = async (uploadId: string) => {
    if (!repoId) {
      return;
    }

    if (!window.confirm("Delete this uploaded KT file?")) {
      return;
    }

    try {
      await deleteRepositoryUpload(repoId, uploadId);
      await fetchUploads();
    } catch {
      setUploadError("Unable to delete this file.");
    }
  };

  const handleDownloadUpload = async (upload: RepositoryUpload) => {
    if (!repoId) {
      return;
    }

    try {
      await downloadRepositoryUpload(repoId, upload);
    } catch {
      setUploadError("Unable to download this file.");
    }
  };

  const entries = knowledgeBase?.entries ?? [];
  const fileTreeEntry = findEntry(entries, "file_tree");
  const readmeEntry = findEntry(entries, "readme");
  const dependencyEntries = entries.filter((entry) => entry.entry_type === "dependencies");

  const filterFileTreeNodes = (nodes: FileTreeNode[], query: string): FileTreeNode[] => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return nodes;
    }

    return nodes.reduce<FileTreeNode[]>((matches, node) => {
      const children = filterFileTreeNodes(node.children, normalizedQuery);
      const isMatch = node.name.toLowerCase().includes(normalizedQuery) || node.path.toLowerCase().includes(normalizedQuery);

      if (isMatch || children.length > 0) {
        matches.push({ ...node, children });
      }

      return matches;
    }, []);
  };

  const handleSelectFile = async (path: string) => {
    if (!repoId) {
      return;
    }

    setSelectedFilePath(path);
    setSelectedFile(null);
    setFileError("");
    setFileLoading(true);
    try {
      const file = await getRepositoryFile(repoId, path);
      setSelectedFile(file);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? error.response?.data?.detail : null;
      setFileError(
        typeof detail === "string" && detail.trim()
          ? detail
          : "Unable to preview this file.",
      );
    } finally {
      setFileLoading(false);
    }
  };

  const renderCodePreview = (content: string) => {
    const lines = content.split(/\r?\n/);

    return (
      <div className={styles.codeViewer}>
        {lines.map((line, index) => (
          <div className={styles.codeLine} key={`${index}-${line}`}>
            <span className={styles.lineNumber}>{index + 1}</span>
            <code className={styles.lineContent}>{line || " "}</code>
          </div>
        ))}
      </div>
    );
  };

  const renderFilePreview = () => {
    if (!selectedFilePath) {
      return (
        <div className={styles.emptyPreview}>
          <p>Select a file to preview its content.</p>
        </div>
      );
    }

    if (fileLoading) {
      return (
        <div className={styles.emptyPreview}>
          <Loader label={`Loading ${selectedFilePath}...`} />
        </div>
      );
    }

    if (fileError) {
      return (
        <div className={styles.emptyPreview}>
          <p className={styles.error}>{fileError}</p>
        </div>
      );
    }

    if (!selectedFile) {
      return (
        <div className={styles.emptyPreview}>
          <EmptyState title="No preview available" description={`${selectedFilePath} cannot be previewed.`} />
        </div>
      );
    }

    if (selectedFile.entry_type === "image_file") {
      return selectedFile.content.startsWith("data:") ? (
        <div className={styles.imagePreviewWrap}>
          <img className={styles.imagePreview} src={selectedFile.content} alt={selectedFile.path} />
        </div>
      ) : (
        <p className={styles.muted}>{selectedFile.content}</p>
      );
    }

    return renderCodePreview(selectedFile.content);
  };

  const renderFileTreeNodes = (nodes: FileTreeNode[], forceOpen = false) => (
    <ul className={styles.fileTreeList}>
      {nodes.map((node) => (
        <li key={node.path}>
          {node.type === "folder" ? (
            <details className={styles.fileTreeFolder} open={forceOpen || undefined}>
              <summary title={node.path}>
                <span className={styles.fileIcon} aria-hidden="true">&gt;</span>
                <span>{node.name}</span>
              </summary>
              {node.children.length > 0 ? renderFileTreeNodes(node.children, forceOpen) : null}
            </details>
          ) : (
            <button
              className={`${styles.fileTreeFile} ${selectedFilePath === node.path ? styles.fileTreeFileActive : ""}`}
              onClick={() => handleSelectFile(node.path)}
              title={node.path}
              type="button"
            >
              <span className={styles.fileIcon} aria-hidden="true">-</span>
              <span>{node.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  const renderTabContent = () => {
    if (activeTab === "file_tree") {
      if (!fileTreeEntry) {
        return <p className={styles.muted}>Not found in this repository</p>;
      }

      const fileTreeNodes = filterFileTreeNodes(buildFileTree(fileTreeEntry.content), fileSearch);
      return fileTreeNodes.length > 0 ? (
        <div className={styles.fileWorkspace}>
          <aside className={styles.fileSidebar}>
            <div className={styles.fileSidebarHeader}>
              <strong>Files</strong>
              <span>{repository?.branch || "main"}</span>
            </div>
            <input
              className={styles.fileSearch}
              onChange={(event) => setFileSearch(event.target.value)}
              placeholder="Go to file"
              type="search"
              value={fileSearch}
            />
            <div className={styles.fileTree}>{renderFileTreeNodes(fileTreeNodes, Boolean(fileSearch.trim()))}</div>
          </aside>
          <section className={styles.filePreview}>
            <div className={styles.filePreviewHeader}>
              <div>
                <strong>{selectedFilePath ? selectedFilePath.split("/").pop() : "Select a file"}</strong>
                {selectedFilePath ? <span>{selectedFilePath}</span> : null}
              </div>
              {selectedFile ? <span>{selectedFile.size.toLocaleString()} bytes</span> : null}
            </div>
            {renderFilePreview()}
          </section>
        </div>
      ) : (
        <EmptyState title="No files matched your search" description="Try a different file name or path." />
      );
    }

    if (activeTab === "readme") {
      return readmeEntry ? (
        <pre className={styles.codeBlock}>{readmeEntry.content}</pre>
      ) : (
        <p className={styles.muted}>Not found in this repository</p>
      );
    }

    if (activeTab === "dependencies") {
      return dependencyEntries.length > 0 ? (
        <div className={styles.dependencyList}>
          {dependencyEntries.map((entry) => (
            <div key={entry.id} className={styles.dependencyItem}>
              <h3>{entry.file_path}</h3>
              <pre className={styles.codeBlock}>{entry.content}</pre>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>Not found in this repository</p>
      );
    }

    if (activeTab === "uploads") {
      return (
        <div className={styles.uploadPanel}>
          <div className={styles.uploadHeader}>
            <div>
              <h3>Uploaded KT Files</h3>
              <p>Extra sheets, docs, images, and reference files for this repository.</p>
            </div>
            {role === "ADMIN" ? (
              <label className={`${styles.primaryButton} ${styles.uploadButton}`}>
                {uploadingDocument ? "Uploading..." : "Upload File"}
                <input disabled={uploadingDocument} onChange={handleUploadDocument} type="file" />
              </label>
            ) : null}
          </div>

          {uploadError ? <p className={styles.error}>{uploadError}</p> : null}

          {uploadsLoading ? (
            <Loader label="Loading uploaded files..." />
          ) : uploads.length === 0 ? (
            <EmptyState title="No uploaded KT files" description="Extra sheets, docs, images, and reference files will appear here." />
          ) : (
            <div className={styles.uploadList}>
              {uploads.map((upload) => (
                <div className={styles.uploadItem} key={upload.id}>
                  <div className={styles.uploadMeta}>
                    <strong>{upload.filename}</strong>
                    <span>
                      {upload.content_type || "file"} &middot; {formatFileSize(upload.size)} &middot; {formatDate(upload.uploaded_at)}
                    </span>
                  </div>
                  <div className={styles.uploadActions}>
                    <button className={styles.secondaryButton} onClick={() => handleDownloadUpload(upload)} type="button">
                      Download
                    </button>
                    {role === "ADMIN" ? (
                      <button className={styles.deleteButton} onClick={() => handleDeleteUpload(upload.id)} type="button">
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  if (loading && !repository) {
    return <div className={styles.state}><Loader label="Loading repository..." /></div>;
  }

  if (error || !repository) {
    return <div className={styles.state}>{error || "Repository not found."}</div>;
  }

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow="Repository"
        heading={repository.name}
        subtitle={repository.url || "Local upload"}
        cornerAction={
          <button className={`${styles.outlineButton} ${styles.infoButton}`} type="button" onClick={() => setShowRepositoryInfo(true)}>
            <Info size={16} />
            Info
          </button>
        }
        action={
          <div className={styles.headerActions}>
            <button
              className={styles.backButton}
              type="button"
              onClick={() => navigate(role === "LEARNER" ? "/dashboard" : "/repositories")}
            >
              &#8592; Repositories
            </button>
            <span className={`${styles.badge} ${getStatusClass(repository.status)}`}>{repository.status}</span>
            <button className={styles.outlineButton} type="button" onClick={handleReanalyze} disabled={refreshing}>
              Re-analyze
            </button>
          </div>
        }
      />
      {refreshError ? <p className={styles.error}>{refreshError}</p> : null}

      <Modal
        isOpen={showRepositoryInfo}
        onClose={() => setShowRepositoryInfo(false)}
        title="Repository Information"
      >
        <dl className={styles.infoGrid}>
          <div className={`${styles.infoItem} ${styles.providerInfoItem}`}>
            <dt>Provider</dt>
            <dd>{repository.provider || "Local"}</dd>
          </div>
          <div className={styles.infoItem}>
            <dt>Language</dt>
            <dd>{repository.language || "-"}</dd>
          </div>
          <div className={styles.infoItem}>
            <dt>Modules</dt>
            <dd>{repository.module_count}</dd>
          </div>
          <div className={styles.infoItem}>
            <dt>Files</dt>
            <dd>{repository.file_count ?? 0}</dd>
          </div>
          <div className={styles.infoItem}>
            <dt>Branch</dt>
            <dd>{repository.branch || "-"}</dd>
          </div>
          <div className={styles.infoItem}>
            <dt>Source</dt>
            <dd>{repository.source_type}</dd>
          </div>
          <div className={styles.infoItem}>
            <dt>Knowledge-base entries</dt>
            <dd>{knowledgeBase?.total ?? 0}</dd>
          </div>
          <div className={styles.infoItem}>
            <dt>Created</dt>
            <dd>{formatDate(repository.created_at)}</dd>
          </div>
        </dl>
      </Modal>

      <Modal
        isOpen={Boolean(refreshAuthError)}
        onClose={() => {
          setRefreshAuthError(null);
          setAzurePatError("");
        }}
        title={refreshAuthError ? providerReconnectTitle[refreshAuthError.provider] : "Reconnect Account"}
      >
        {refreshAuthError ? (
          <div className={styles.authModalBody}>
            <p>{refreshAuthError.message}</p>
            {refreshAuthError.provider === "azure" ? (
              <>
                <input
                  className={styles.input}
                  onChange={(event) => setAzurePat(event.target.value)}
                  placeholder="Paste your Azure DevOps Personal Access Token"
                  type="password"
                  value={azurePat}
                />
                <div className={styles.modalActions}>
                  <button
                    className={styles.primaryButton}
                    disabled={savingAzurePat || !azurePat.trim()}
                    onClick={handleSaveAzurePatAndRetry}
                    type="button"
                  >
                    {savingAzurePat ? "Saving..." : "Save PAT and Retry"}
                  </button>
                </div>
                {azurePatError ? <p className={styles.error}>{azurePatError}</p> : null}
              </>
            ) : (
              <div className={styles.modalActions}>
                <button className={styles.primaryButton} onClick={handleProviderReconnect} type="button">
                  {providerReconnectTitle[refreshAuthError.provider]}
                </button>
                <span className={styles.muted}>
                  Refresh will resume automatically after {providerLabels[refreshAuthError.provider]} reconnects.
                </span>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <div className={styles.workspaceLayout}>
        <main className={styles.workspaceMain}>
          <section className={styles.knowledgeSection}>
            <article className={`${styles.card} ${styles.knowledgeCard}`}>
              <div className={styles.cardHeader}>
                <h2>Knowledge Base</h2>
                <span className={`${styles.badge} ${getStatusClass(repository.knowledge_base_status ?? "none")}`}>
                  {repository.knowledge_base_status ?? "none"}
                </span>
              </div>

              {repository.knowledge_base_status === "none" ? (
                <EmptyState title="Analysis pending" description="Knowledge base will be generated after indexing" />
              ) : null}

              {repository.knowledge_base_status === "building" ? (
                <div className={styles.buildingState}>
                  <span className={styles.spinner} />
                  <span>Building knowledge base&hellip;</span>
                </div>
              ) : null}

              {repository.knowledge_base_status === "ready" ? (
                <>
                  <div className={styles.tabBar}>
                    {tabs.map((tab) => (
                      <button
                        key={tab.key}
                        className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""}`}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {renderTabContent()}
                </>
              ) : null}
            </article>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>KT Topics</h2>
              {role === "ADMIN" ? (
                <button className={styles.primaryButton} onClick={() => setShowTopicForm(!showTopicForm)} type="button">
                  {showTopicForm ? "Cancel" : "+ Add Topic"}
                </button>
              ) : null}
            </div>

            {role === "ADMIN" && showTopicForm ? (
              <form onSubmit={handleCreateTopic} className={styles.topicForm}>
                <input
                  className={styles.input}
                  placeholder="Topic title (e.g. Payment Gateway Integration)"
                  value={topicTitle}
                  onChange={(event) => setTopicTitle(event.target.value)}
                  required
                />
                <input
                  className={styles.input}
                  placeholder="Description (optional)"
                  value={topicDescription}
                  onChange={(event) => setTopicDescription(event.target.value)}
                />
                <input
                  className={styles.input}
                  placeholder="Path patterns, comma-separated (e.g. src/payments,src/billing)"
                  value={topicPaths}
                  onChange={(event) => setTopicPaths(event.target.value)}
                />
                {topicError ? <p className={styles.error}>{topicError}</p> : null}
                <button className={styles.primaryButton} type="submit" disabled={creatingTopic}>
                  {creatingTopic ? "Creating..." : "Create Topic"}
                </button>
              </form>
            ) : null}

            {topics.length === 0 ? (
              <EmptyState
                title={role === "ADMIN" ? "No KT topics yet" : "No KT topics assigned yet"}
                description={
                  role === "ADMIN"
                    ? "Add one to start organizing knowledge transfer."
                    : "Assigned KT topics will appear here."
                }
              />
            ) : (
              <div className={styles.topicList}>
                {topics.map((topic, index) => (
                  <div key={topic.id} className={`${styles.topicItem} ${getTopicAccentClass(index)}`}>
                    <div>
                      <strong>{topic.title}</strong>
                      {topic.description ? <p className={styles.topicDescription}>{topic.description}</p> : null}
                      {topic.path_patterns ? <span className={styles.pathTag}>{topic.path_patterns}</span> : null}
                    </div>
                    <div className={styles.topicActions}>
                      <button className={styles.linkButton} onClick={() => toggleChecklist(topic.id)} type="button">
                        {expandedChecklistTopicIds[topic.id] ? "Hide Checklist" : "View Checklist"}
                      </button>
                      {role === "ADMIN" ? (
                        <>
                          <button className={styles.linkButton} onClick={() => handleViewRecommendation(topic.id)} type="button">
                            Recommend Person
                          </button>
                          <button
                            className={styles.linkButton}
                            onClick={() =>
                              navigate(
                                ROUTES.assessmentBuild
                                  .replace(":repoId", repoId || "")
                                  .replace(":topicId", topic.id),
                              )
                            }
                            type="button"
                          >
                            Manage Assessment
                          </button>
                          <button className={styles.deleteButton} onClick={() => handleDeleteTopic(topic.id)} type="button">
                            Remove
                          </button>
                        </>
                      ) : null}
                    </div>
                    {recommendations[topic.id] ? (
                      <div className={styles.recommendationBox}>
                        {recommendations[topic.id].length === 0 ? (
                          <EmptyState
                            title="No matching contributors found"
                            description="Run Analyze Contributors first, or check the path patterns."
                          />
                        ) : (
                          recommendations[topic.id].map((recommendation, index) => (
                            <div key={`${recommendation.email}-${index}`} className={styles.recommendationRow}>
                              <span>{recommendation.name} ({recommendation.email})</span>
                              <span>
                                {recommendation.relevant_file_matches} relevant files &middot; {recommendation.commit_count} total commits
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                    {expandedChecklistTopicIds[topic.id] && repoId ? (
                      <KTChecklist repoId={repoId} topicId={topic.id} isAdmin={role === "ADMIN"} />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {role === "ADMIN" ? (
            <>
              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2>Code Contributors</h2>
                    <p className={styles.helperText}>
                      Contributor analysis is based on commit authorship, not PR approvers.
                    </p>
                  </div>
                  <button
                    className={styles.secondaryButton}
                    onClick={handleAnalyzeContributors}
                    disabled={analyzingContributors || repository.source_type !== "git"}
                    type="button"
                  >
                    {analyzingContributors ? "Analyzing..." : "Analyze Contributors"}
                  </button>
                </div>
                {contributorError ? <p className={styles.error}>{contributorError}</p> : null}
                {contributors.length === 0 ? (
                  <EmptyState
                    title="No contributor data yet"
                    description="Click Analyze Contributors to extract commit history."
                  />
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Commits</th>
                        <th>Files touched</th>
                        <th>Top files</th>
                        <th>PRs authored</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributors.map((contributor) => (
                        <tr key={contributor.id}>
                          <td>{contributor.name}</td>
                          <td>{contributor.email}</td>
                          <td>{contributor.commit_count}</td>
                          <td>{contributor.files_touched ?? "-"}</td>
                          <td>{formatTopFiles(contributor.top_files)}</td>
                          <td>{contributor.prs_authored ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className={styles.card}>
                <h2>Current Learning</h2>

                <div className={styles.assignForm}>
                  <select
                    className={styles.input}
                    value={selectedLearnerId}
                    onChange={(event) => setSelectedLearnerId(event.target.value)}
                  >
                    <option value="">Select Learner...</option>
                    {learners.map((learner) => (
                      <option key={learner.id} value={learner.id}>{learner.name} ({learner.email})</option>
                    ))}
                  </select>
                  <select
                    className={styles.input}
                    value={selectedTopicId}
                    onChange={(event) => setSelectedTopicId(event.target.value)}
                  >
                    <option value="">Select Topic...</option>
                    {topics.map((topic) => (
                      <option key={topic.id} value={topic.id}>{topic.title}</option>
                    ))}
                  </select>
                  <button
                    className={styles.primaryButton}
                    onClick={handleAssign}
                    type="button"
                    disabled={assigning || !selectedLearnerId}
                  >
                    {assigning ? "Assigning..." : "Assign"}
                  </button>
                </div>
                {assignError ? <p className={styles.error}>{assignError}</p> : null}

                {assignments.length === 0 ? (
                  <EmptyState title="No learners assigned yet" description="Assigned learners will appear here." />
                ) : (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>KT Topic</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td>{assignment.learner_name} ({assignment.learner_email})</td>
                          <td>{assignment.kt_topic_title || "General"}</td>
                          <td>
                            <span className={`${styles.badge} ${getStatusClass(assignment.status)}`}>
                              {assignment.status}
                            </span>
                          </td>
                          <td>
                            <button className={styles.deleteButton} onClick={() => handleUnassign(assignment.id)} type="button">
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          ) : null}
        </main>

        <aside className={styles.workspaceSidebar}>
          {repoId ? <ChatPanel repoId={repoId} /> : null}
        </aside>
      </div>
    </div>
  );
}

export default RepositoryPage;
