import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CloudUpload, RefreshCw, Trash2, Upload } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import azureDevopsIcon from "../assets/azure-devops.svg";
import bitbucketIcon from "../assets/BitBucket.svg";
import githubIcon from "../assets/github-svgrepo-com.svg";
import gitlabIcon from "../assets/gitlab-svgrepo-com.svg";
import { ENV } from "../constants/env";
import { ConfirmDialog, EmptyState, Input, Loader, PageHero, SearchInput, Table } from "../components/common";
import type { TableColumn } from "../components/common/Table";
import {
  connectRepository,
  deleteRepository,
  listRepositories,
  refreshRepository,
  uploadRepository,
} from "../services/repositoryService";
import apiClient from "../services/api";
import type { Repository } from "../services/repositoryService";
import { extractApiErrorDetail } from "../utils/errorUtils";
import styles from "./RepositoryOnboard.module.css";

/**
 * Maps a backend error detail string to a human-friendly message.
 * Returns the original detail if no specific mapping matches,
 * or a generic fallback if detail is empty.
 */
function mapRepositoryError(detail: string, fallback: string): string {
  const d = detail.toLowerCase();
  if (d.includes("repository already exists")) {
    return "This repository has already been added. You can find it in the list below.";
  }
  if (d.includes("auth_required") || d.includes("auth required") || d.includes("not connected")) {
    return "Your account is not connected to this Git provider. Use the provider tab to connect first.";
  }
  if (d.includes("auth_invalid") || d.includes("invalid") || d.includes("401") || d.includes("403")) {
    return "Authentication failed. Your access token may have expired or lack permission for this repository. Re-connect the provider and try again.";
  }
  if (d.includes("not found") || d.includes("404")) {
    return "Repository not found. Check that the URL is correct and that you have access to it.";
  }
  if (d.includes("branch")) {
    return "The specified branch was not found in this repository. Check the branch name and try again.";
  }
  if (d.includes("valid git repository url") || d.includes("https://")) {
    return "Please enter a valid repository URL starting with https://.";
  }
  if (d.includes("azure devops pat") || d.includes("pat")) {
    return "Please save your Azure DevOps Personal Access Token before connecting an Azure repository.";
  }
  if (d.includes("valid azure")) {
    return "Please enter a valid Azure DevOps URL (e.g. https://dev.azure.com/org/project/_git/repo).";
  }
  return detail || fallback;
}

const PENDING_REFRESH_REPO_KEY = "synapseiq.pendingRefreshRepoId";
const PENDING_REFRESH_PROVIDER_KEY = "synapseiq.pendingRefreshProvider";
type RepositoryProviderKey = "github" | "gitlab" | "bitbucket" | "azure" | "upload";

const providerIcons: Record<Exclude<RepositoryProviderKey, "upload">, string> = {
  github: githubIcon,
  gitlab: gitlabIcon,
  bitbucket: bitbucketIcon,
  azure: azureDevopsIcon,
};

function ProviderIcon({ provider, size = 20 }: { provider: RepositoryProviderKey; size?: number }) {
  if (provider === "upload") {
    return <Upload size={size} />;
  }

  return (
    <img
      alt=""
      className={styles.providerLogo}
      src={providerIcons[provider]}
      style={{
        width: size,
        height: size,
      }}
    />
  );
}

function getStatusClass(status: Repository["status"]) {
  switch (status) {
    case "indexed":
      return styles.badgeIndexed;
    case "indexing":
      return styles.badgeIndexing;
    case "error":
      return styles.badgeError;
    case "pending":
    default:
      return styles.badgePending;
  }
}

function getStatusReason(repository: Repository) {
  if (repository.status === "error") {
    return repository.error_message || "Analysis failed. Check backend logs for details.";
  }
  if (repository.status === "pending") {
    return "Waiting for background analysis to start.";
  }
  if (repository.status === "indexing") {
    return "Cloning and analyzing repository.";
  }
  return "";
}

function getRepositoryStatusReason(repository: Repository) {
  if (repository.source_type === "upload" && repository.status === "indexing") {
    return "Extracting and analyzing local archive.";
  }
  return getStatusReason(repository);
}

function formatProviderStatus(status: "unknown" | "connected" | "disconnected") {
  if (status === "connected") return "Connected";
  if (status === "disconnected") return "Not connected";
  return "Checking";
}

function getRepositoryProvider(repository: Repository) {
  if (repository.source_type === "upload") return "upload";

  const source = `${repository.provider || repository.source_type || ""}`.toLowerCase();
  if (source.includes("gitlab")) return "gitlab";
  if (source.includes("bitbucket")) return "bitbucket";
  if (source.includes("azure")) return "azure";
  if (source.includes("github") || repository.source_type === "git") return "github";
  return "upload";
}

function getRepositorySourceLabel(repository: Repository) {
  const provider = getRepositoryProvider(repository);
  switch (provider) {
    case "gitlab":
      return "GitLab";
    case "bitbucket":
      return "Bitbucket";
    case "azure":
      return "Azure DevOps";
    case "github":
      return "GitHub";
    case "upload":
    default:
      return "Local upload";
  }
}

function getRepositoryIcon(repository: Repository) {
  return <ProviderIcon provider={getRepositoryProvider(repository)} size={19} />;
}

function getRepositoryIconClass(repository: Repository) {
  const provider = getRepositoryProvider(repository);
  switch (provider) {
    case "gitlab":
      return styles.repositoryIconGitlab;
    case "bitbucket":
      return styles.repositoryIconBitbucket;
    case "azure":
      return styles.repositoryIconAzure;
    case "github":
      return styles.repositoryIconGithub;
    case "upload":
    default:
      return styles.repositoryIconUpload;
  }
}

function RepositoryOnboardPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [provider, setProvider] = useState<RepositoryProviderKey>("github");
  const [repoSearch, setRepoSearch] = useState("");
  const [githubStatus, setGithubStatus] = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [gitlabStatus, setGitlabStatus] = useState<"connected" | "disconnected" | "unknown">("unknown");
  const [bitbucketStatus, setBitbucketStatus] = useState<"connected" | "disconnected" | "unknown">("unknown");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string>("");
  const [azureStatus, setAzureStatus] = useState<"connected" | "disconnected" | "unknown">("unknown");
  const [azurePat, setAzurePat] = useState("");
  const [azurePatSaving, setAzurePatSaving] = useState(false);
  const [azureRepoUrl, setAzureRepoUrl] = useState("");
  const [azureBranch, setAzureBranch] = useState("main");
  const [connectSuccess, setConnectSuccess] = useState("");

  const filteredRepositories = useMemo(() => {
    const query = repoSearch.trim().toLowerCase();
    if (!query) return repositories;
    return repositories.filter((repository) =>
      [repository.name, repository.source_type, repository.provider, repository.branch, repository.language]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [repoSearch, repositories]);

  const fetchRepositories = async () => {
    setLoading(true);
    try {
      const response = await listRepositories();
      setRepositories(response.repositories);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositories().catch(() => {
      setConnectError("Unable to load repositories.");
    });

    apiClient.get("/auth/github/status")
      .then((res) => {
        setGithubStatus(res.data.connected ? "connected" : "disconnected");
      })
      .catch(() => setGithubStatus("disconnected"));

    apiClient.get("/auth/azure/status")
      .then((res) => setAzureStatus(res.data.connected ? "connected" : "disconnected"))
      .catch(() => setAzureStatus("disconnected"));

    apiClient.get("/auth/gitlab/status")
      .then(res => setGitlabStatus(res.data.connected ? "connected" : "disconnected"))
      .catch(() => setGitlabStatus("disconnected"));

    apiClient.get("/auth/bitbucket/status")
      .then(res => setBitbucketStatus(res.data.connected ? "connected" : "disconnected"))
      .catch(() => setBitbucketStatus("disconnected"));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connectedProvider = params.get("github") === "connected"
      ? "github"
      : params.get("gitlab") === "connected"
        ? "gitlab"
        : params.get("bitbucket") === "connected"
          ? "bitbucket"
          : null;

    if (params.get("github") === "connected") {
      setGithubStatus("connected");
    }

    if (params.get("gitlab") === "connected") {
      setGitlabStatus("connected");
      setProvider("gitlab");
      setConnectError("");
    }

    if (params.get("bitbucket") === "connected") {
      setBitbucketStatus("connected");
      setProvider("bitbucket");
      setConnectError("");
    }

    if (connectedProvider) {
      const pendingRepoId = localStorage.getItem(PENDING_REFRESH_REPO_KEY);
      const pendingProvider = localStorage.getItem(PENDING_REFRESH_PROVIDER_KEY);
      window.history.replaceState({}, "", location.pathname);

      if (pendingRepoId && pendingProvider === connectedProvider) {
        navigate(`/repositories/${pendingRepoId}?retryRefresh=1`, { replace: true });
      }
    }
  }, []);

  useEffect(() => {
    const hasTransientRepository = repositories.some((repository) =>
      ["pending", "indexing"].includes(repository.status)
    );

    repositories.forEach((repository) => {
      if (repository.status === "error") {
        console.error("[RepositoryOnboard] Repository analysis failed", {
          id: repository.id,
          name: repository.name,
          reason: repository.error_message || "No error message returned by backend.",
        });
      }
      if (repository.status === "pending" || repository.status === "indexing") {
        console.info("[RepositoryOnboard] Repository analysis pending", {
          id: repository.id,
          name: repository.name,
          status: repository.status,
          reason: getRepositoryStatusReason(repository),
        });
      }
    });

    if (!hasTransientRepository) {
      return;
    }

    const timer = setTimeout(() => {
      fetchRepositories();
    }, 5000);

    return () => clearTimeout(timer);
  }, [repositories]);

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConnectError("");
    setConnectSuccess("");

    const repositoryUrl = url.trim();
    if (!repositoryUrl) {
      setConnectError("Please provide a URL.");
      return;
    }
    if (!repositoryUrl.startsWith("https://")) {
      setConnectError("Repository URL must start with https://");
      return;
    }

    setSubmitting(true);
    try {
      await connectRepository(repositoryUrl, branch || "main");
      setUrl("");
      setBranch("main");
      await fetchRepositories();
      setConnectSuccess("Repository connected successfully.");
    } catch (err: unknown) {
      console.error("[RepositoryOnboard] Connect repository failed", err);
      const detail = extractApiErrorDetail(err);
      setConnectError(mapRepositoryError(detail, "Unable to connect repository. Please check the URL and your provider connection."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAzureConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConnectError("");
    setConnectSuccess("");

    const repositoryUrl = azureRepoUrl.trim();
    if (!repositoryUrl) {
      setConnectError("Please provide a URL.");
      return;
    }
    if (!repositoryUrl.startsWith("https://")) {
      setConnectError("Repository URL must start with https://");
      return;
    }

    setSubmitting(true);
    try {
      await connectRepository(repositoryUrl, azureBranch || "main", "azure");
      setAzureRepoUrl("");
      setAzureBranch("main");
      await fetchRepositories();
      setConnectSuccess("Azure DevOps repository connected successfully.");
    } catch (err: unknown) {
      console.error("[RepositoryOnboard] Connect Azure repository failed", err);
      const detail = extractApiErrorDetail(err);
      setConnectError(mapRepositoryError(detail, "Unable to connect repository. Please check the URL and your provider connection."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (file?: File) => {
    if (!file) {
      return;
    }

    setUploadError("");
    setSubmitting(true);
    try {
      await uploadRepository(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await fetchRepositories();
    } catch (err: unknown) {
      const detail = extractApiErrorDetail(err);
      setUploadError(mapRepositoryError(detail, "Upload failed. Only ZIP archives under 2 GB are supported."));
    } finally {
      setSubmitting(false);
      setDragActive(false);
    }
  };

  const handleRefreshAll = async () => {
    const refreshableRepositories = repositories.filter((repository) =>
      ["pending", "error"].includes(repository.status)
    );

    if (refreshableRepositories.length === 0) {
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(refreshableRepositories.map((repository) => refreshRepository(repository.id)));
      await fetchRepositories();
    } catch (err: unknown) {
      console.error("[RepositoryOnboard] Refresh repositories failed", err);
      const detail = extractApiErrorDetail(err);
      setConnectError(mapRepositoryError(detail, "Unable to refresh repositories. Please check the URL and your provider connection."));
    } finally {
      setSubmitting(false);
    }
  };

  const requestDelete = (id: string, name: string) => {
    setConfirmDeleteId(id);
    setConfirmDeleteName(name);
  };

  const handleConfirmedDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      await deleteRepository(id);
      setRepositories((prev) => prev.filter((repository) => repository.id !== id));
    } catch {
      setConnectError("Unable to remove repository.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveAzurePat = async () => {
    if (!azurePat.trim()) return;
    setConnectError("");
    setConnectSuccess("");
    setAzurePatSaving(true);
    try {
      await apiClient.post(`/auth/azure/pat?pat=${encodeURIComponent(azurePat)}`);
      setAzureStatus("connected");
      setAzurePat("");
      setConnectSuccess("Azure DevOps PAT saved.");
    } catch {
      setConnectError("Failed to save Azure PAT.");
    } finally {
      setAzurePatSaving(false);
    }
  };

  const repositoryColumns: TableColumn<Repository>[] = [
    {
      key: "repository",
      header: "Repository",
      render: (repository) => (
        <div className={styles.repositoryIdentity}>
          <span className={`${styles.repositoryIcon} ${getRepositoryIconClass(repository)}`}>
            {getRepositoryIcon(repository)}
          </span>
          <div className={styles.repositoryText}>
            <div className={styles.repositoryName}>{repository.name}</div>
            <div className={styles.repositorySource}>{getRepositorySourceLabel(repository)}</div>
          </div>
        </div>
      ),
    },
    { key: "branch", header: "Branch", render: (repository) => repository.branch || "-" },
    { key: "language", header: "Language", render: (repository) => repository.language || "-" },
    { key: "module_count", header: "Modules" },
    {
      key: "status",
      header: "Status",
      render: (repository) => {
        const hasError = repository.status === "error";
        const statusReason = hasError ? "Indexing failed" : getRepositoryStatusReason(repository);
        const errorMessage = repository.error_message || "Analysis failed. Check backend logs for details.";

        return (
          <div className={styles.statusCell}>
            <span className={`${styles.badge} ${getStatusClass(repository.status)}`}>
              {repository.status === "indexing" ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" style={{ marginRight: 6 }}>
                  <path
                    d="M21 12a9 9 0 1 1-2.64-6.36"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                  <animateTransform
                    attributeName="transform"
                    dur="0.8s"
                    from="0 12 12"
                    repeatCount="indefinite"
                    to="360 12 12"
                    type="rotate"
                  />
                </svg>
              ) : null}
              {hasError ? "Error" : repository.status}
            </span>
            {hasError ? (
              <span className={styles.statusIcon} title={errorMessage} aria-label={errorMessage}>
                <AlertTriangle size={14} />
              </span>
            ) : null}
            {statusReason ? (
              <div className={styles.statusReason} title={hasError ? errorMessage : statusReason}>
                {statusReason}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "action",
      header: "Actions",
      render: (repository) => (
        <div className={styles.actionCell}>
          <button
            className={styles.viewButton}
            type="button"
            onClick={() => {
              if (repository.status === "indexed") {
                navigate(`/repositories/${repository.id}`);
                return;
              }

              console.log(repository.id);
            }}
          >
            View
          </button>
          <button
            aria-label={`Remove ${repository.name}`}
            className={styles.deleteButton}
            type="button"
            onClick={() => requestDelete(repository.id, repository.name)}
            disabled={deletingId === repository.id}
            title="Remove repository"
          >
            <Trash2 aria-hidden="true" size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow="Repositories"
        heading="Repositories"
      />

      <section className={styles.connectCard}>
        <div className={styles.connectCardHeader}>
          <div>
            <h2>Connect Repository</h2>
            <p>Select a source provider or upload a local ZIP archive</p>
          </div>
        </div>

        <div className={styles.providerTabs}>
          <button
            className={`${styles.providerTab} ${provider === "github" ? styles.providerTabActive : ""}`}
            type="button"
            onClick={() => {
              setProvider("github");
              setConnectError("");
              setUploadError("");
            }}
          >
            <span className={`${styles.providerMark} ${styles.githubMark}`}><ProviderIcon provider="github" /></span>
            <strong>GitHub</strong>
            <span className={`${styles.connectionBadge} ${githubStatus === "connected" ? styles.connected : styles.notConnected}`}>
              {formatProviderStatus(githubStatus)}
            </span>
            <small>Private repos {githubStatus === "connected" ? "enabled" : "disabled"}</small>
          </button>
          <button
            className={`${styles.providerTab} ${provider === "gitlab" ? styles.providerTabActive : ""}`}
            type="button"
            onClick={() => {
              setProvider("gitlab");
              setConnectError("");
              setUploadError("");
            }}
          >
            <span className={`${styles.providerMark} ${styles.gitlabMark}`}><ProviderIcon provider="gitlab" /></span>
            <strong>GitLab</strong>
            <span className={`${styles.connectionBadge} ${gitlabStatus === "connected" ? styles.connected : styles.notConnected}`}>
              {formatProviderStatus(gitlabStatus)}
            </span>
            <small>Private repos {gitlabStatus === "connected" ? "enabled" : "disabled"}</small>
          </button>
          <button
            className={`${styles.providerTab} ${provider === "bitbucket" ? styles.providerTabActive : ""}`}
            type="button"
            onClick={() => {
              setProvider("bitbucket");
              setConnectError("");
              setUploadError("");
            }}
          >
            <span className={`${styles.providerMark} ${styles.bitbucketMark}`}><ProviderIcon provider="bitbucket" /></span>
            <strong>Bitbucket</strong>
            <span className={`${styles.connectionBadge} ${bitbucketStatus === "connected" ? styles.connected : styles.notConnected}`}>
              {formatProviderStatus(bitbucketStatus)}
            </span>
            <small>Private repos {bitbucketStatus === "connected" ? "enabled" : "disabled"}</small>
          </button>
          <button
            className={`${styles.providerTab} ${provider === "azure" ? styles.providerTabActive : ""}`}
            type="button"
            onClick={() => {
              setProvider("azure");
              setConnectError("");
              setUploadError("");
            }}
          >
            <span className={`${styles.providerMark} ${styles.azureMark}`}><ProviderIcon provider="azure" /></span>
            <strong>Azure DevOps</strong>
            <span className={`${styles.connectionBadge} ${azureStatus === "connected" ? styles.patSaved : styles.notConnected}`}>
              {azureStatus === "connected" ? "PAT saved" : formatProviderStatus(azureStatus)}
            </span>
            <small>Private repos {azureStatus === "connected" ? "enabled" : "disabled"}</small>
          </button>
          <button
            className={`${styles.providerTab} ${provider === "upload" ? styles.providerTabActive : ""}`}
            type="button"
            onClick={() => {
              setProvider("upload");
              setConnectError("");
              setUploadError("");
            }}
          >
            <Upload size={30} />
            <strong>Upload ZIP</strong>
            <span className={`${styles.connectionBadge} ${styles.notConnected}`}>Local archive</span>
            <small>Use a local ZIP archive</small>
          </button>
        </div>

        {provider === "github" ? (
          <form className={styles.providerPanel} onSubmit={handleConnect}>
            <div className={styles.cardHeader}>
              <div className={`${styles.iconBox} ${styles.githubIcon}`}>
                <ProviderIcon provider="github" size={22} />
              </div>
              <div>
                <h2>GitHub</h2>
                <p>Connect your GitHub account to access private repos</p>
              </div>
            </div>

            <button
              className={styles.oauthButton}
              type="button"
              onClick={() => {
                const stored = localStorage.getItem("synapseiq.auth");
                const token = stored ? (JSON.parse(stored)?.state?.tokens?.accessToken ?? "") : "";
                window.location.href = `${ENV.apiBaseUrl}/auth/github?token=${encodeURIComponent(token)}`;
              }}
            >
              Connect GitHub Account
            </button>

            {githubStatus === "connected" ? (
              <div className={styles.connectedBanner}>
                <span>&#10003; GitHub connected &mdash; private repositories enabled</span>
                <button
                  className={styles.disconnectLink}
                  type="button"
                  onClick={() => {
                    apiClient.delete("/auth/github")
                      .then(() => setGithubStatus("disconnected"))
                      .catch(() => {});
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : githubStatus === "disconnected" ? (
              <div className={styles.warningBanner}>
                &#9888; GitHub not connected &mdash; only public repositories will work
              </div>
            ) : null}

            <div className={styles.divider}>
              <span />
              <strong>or enter a repository URL directly</strong>
              <span />
            </div>

            <div className={styles.formGrid}>
              <Input
className={styles.input}
type="text"
                placeholder="https://github.com/org/repo"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Input
className={styles.input}
type="text"
                placeholder="main"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
              />
            </div>

            {connectError && (
              <div className={styles.errorBanner} role="alert">
                {connectError}
              </div>
            )}

            <button className={styles.primaryButton} type="submit" disabled={submitting}>
              Connect Repository
            </button>
          </form>
        ) : null}

        {provider === "gitlab" ? (
          <form className={styles.providerPanel} onSubmit={handleConnect}>
            <div className={styles.cardHeader}>
              <div className={`${styles.iconBox} ${styles.gitlabPanelIcon}`}>
                <ProviderIcon provider="gitlab" size={22} />
              </div>
              <div>
                <h2>GitLab</h2>
                <p>Connect your GitLab account to access private repos</p>
              </div>
            </div>

            <button
              className={styles.oauthButton}
              type="button"
              onClick={() => {
                const stored = localStorage.getItem("synapseiq.auth");
                const token = stored ? (JSON.parse(stored)?.state?.tokens?.accessToken ?? "") : "";
                window.location.href = `${ENV.apiBaseUrl}/auth/gitlab?token=${encodeURIComponent(token)}`;
              }}
            >
              Connect GitLab Account
            </button>

            {gitlabStatus === "connected" ? (
              <div className={styles.connectedBanner}>
                <span>&#10003; GitLab connected &mdash; private repositories enabled</span>
                <button
                  className={styles.disconnectLink}
                  type="button"
                  onClick={() => {
                    apiClient.delete("/auth/gitlab")
                      .then(() => setGitlabStatus("disconnected"))
                      .catch(() => {});
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : gitlabStatus === "disconnected" ? (
              <div className={styles.warningBanner}>
                &#9888; GitLab not connected &mdash; only public repositories will work
              </div>
            ) : null}

            <div className={styles.divider}>
              <span />
              <strong>or enter a repository URL directly</strong>
              <span />
            </div>

            <div className={styles.formGrid}>
              <Input
className={styles.input}
type="text"
                placeholder="https://gitlab.com/org/repo"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Input
className={styles.input}
type="text"
                placeholder="main"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
              />
            </div>

            {connectError && (
              <div className={styles.errorBanner} role="alert">
                {connectError}
              </div>
            )}

            <button className={styles.primaryButton} type="submit" disabled={submitting}>
              Connect Repository
            </button>
          </form>
        ) : null}

        {provider === "bitbucket" ? (
          <form className={styles.providerPanel} onSubmit={handleConnect}>
            <div className={styles.cardHeader}>
              <div className={`${styles.iconBox} ${styles.bitbucketPanelIcon}`}>
                <ProviderIcon provider="bitbucket" size={22} />
              </div>
              <div>
                <h2>Bitbucket</h2>
                <p>Connect your Bitbucket account to access private repos</p>
              </div>
            </div>

            <button
              className={styles.oauthButton}
              type="button"
              onClick={() => {
                const stored = localStorage.getItem("synapseiq.auth");
                const token = stored ? (JSON.parse(stored)?.state?.tokens?.accessToken ?? "") : "";
                window.location.href = `${ENV.apiBaseUrl}/auth/bitbucket?token=${encodeURIComponent(token)}`;
              }}
            >
              Connect Bitbucket Account
            </button>

            {bitbucketStatus === "connected" ? (
              <div className={styles.connectedBanner}>
                <span>&#10003; Bitbucket connected &mdash; private repositories enabled</span>
                <button
                  className={styles.disconnectLink}
                  type="button"
                  onClick={() => {
                    apiClient.delete("/auth/bitbucket")
                      .then(() => setBitbucketStatus("disconnected"))
                      .catch(() => {});
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : bitbucketStatus === "disconnected" ? (
              <div className={styles.warningBanner}>
                &#9888; Bitbucket not connected &mdash; only public repositories will work
              </div>
            ) : null}

            <div className={styles.divider}>
              <span />
              <strong>or enter a repository URL directly</strong>
              <span />
            </div>

            <div className={styles.formGrid}>
              <Input
className={styles.input}
type="text"
                placeholder="https://bitbucket.org/org/repo"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Input
className={styles.input}
type="text"
                placeholder="main"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
              />
            </div>

            {connectError && (
              <div className={styles.errorBanner} role="alert">
                {connectError}
              </div>
            )}

            <button className={styles.primaryButton} type="submit" disabled={submitting}>
              Connect Repository
            </button>
          </form>
        ) : null}

        {provider === "azure" ? (
          <form className={styles.providerPanel} onSubmit={handleAzureConnect}>
            <div className={styles.cardHeader}>
              <div className={`${styles.iconBox} ${styles.azurePanelIcon}`}>
                <ProviderIcon provider="azure" size={22} />
              </div>
              <div>
                <h2>Azure DevOps</h2>
                <p>Connect with a Personal Access Token</p>
              </div>
            </div>

            {azureStatus === "connected" ? (
              <div className={styles.connectedBanner}>
                <span>&#10003; Connected with PAT</span>
                <button
                  className={styles.disconnectLink}
                  type="button"
                  onClick={() => {
                    apiClient.delete("/auth/azure")
                      .then(() => setAzureStatus("disconnected"))
                      .catch(() => {});
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : azureStatus === "disconnected" ? (
              <div className={styles.warningBanner}>
                &#9888; Azure DevOps PAT not saved
              </div>
            ) : null}

            <Input
className={styles.input}
type="password"
              placeholder="Paste your Azure DevOps Personal Access Token"
              value={azurePat}
              onChange={(event) => setAzurePat(event.target.value)}
            />
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={handleSaveAzurePat}
              disabled={azurePatSaving || !azurePat.trim()}
            >
              Save PAT
            </button>
            <p className={styles.helperText}>
              Generate PAT from Azure DevOps &rarr; User Settings &rarr; Personal Access Tokens. Required scope: Code Read.
            </p>
            {azureStatus !== "connected" && connectError && (
              <div className={styles.errorBanner} role="alert">
                {connectError}
              </div>
            )}

            {azureStatus === "connected" ? (
              <>
                <div className={styles.divider}>
                  <span />
                  <strong>connect an Azure repository</strong>
                  <span />
                </div>

                <div className={styles.formGrid}>
                  <Input
className={styles.input}
type="text"
                    placeholder="https://dev.azure.com/org/project/_git/repo"
                    value={azureRepoUrl}
                    onChange={(event) => setAzureRepoUrl(event.target.value)}
                  />
                  <Input
className={styles.input}
type="text"
                    placeholder="main"
                    value={azureBranch}
                    onChange={(event) => setAzureBranch(event.target.value)}
                  />
                </div>
                <p className={styles.helperText}>
                  Also supported: https://org.visualstudio.com/project/_git/repo
                </p>
                {connectError && (
                  <div className={styles.errorBanner} role="alert">
                    {connectError}
                  </div>
                )}
                {connectSuccess ? <p className={styles.success}>{connectSuccess}</p> : null}
                <button className={styles.primaryButton} type="submit" disabled={submitting}>
                  Connect Repository
                </button>
              </>
            ) : null}
          </form>
        ) : null}

        {provider === "upload" ? (
          <div className={styles.providerPanel}>
            <div className={styles.cardHeader}>
              <div className={`${styles.iconBox} ${styles.uploadIcon}`}>
                <CloudUpload size={22} />
              </div>
              <div>
                <h2>Upload Local Project</h2>
                <p>ZIP or folder upload</p>
              </div>
            </div>

            <div
              className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                handleUpload(event.dataTransfer.files[0]);
              }}
            >
              <CloudUpload size={30} />
              <strong>Drag &amp; drop your project folder</strong>
              <span>or click to browse &middot; Max 2GB</span>
            </div>

            {uploadError && (
              <div className={styles.errorBanner} role="alert">
                {uploadError}
              </div>
            )}

            <input
              ref={fileInputRef}
              className={styles.hiddenInput}
              type="file"
              accept=".zip"
              onChange={(event) => handleUpload(event.target.files?.[0])}
            />
            <button className={styles.secondaryButton} type="button" onClick={() => fileInputRef.current?.click()}>
              Browse Files
            </button>
          </div>
        ) : null}
      </section>

      <section className={styles.repositoryCard}>
        <div className={styles.repositoryHeader}>
          <div>
            <h2>Connected Repositories</h2>
            <p>Repositories you have connected and indexed</p>
          </div>
          <div className={styles.repositoryTools}>
            <SearchInput
              aria-label="Search connected repositories"
              wrapperClassName={styles.repositorySearch}
              onChange={(event) => setRepoSearch(event.target.value)}
              placeholder="Search repositories..."
              value={repoSearch}
            />
            <button
              aria-label="Refresh all repositories"
              className={`${styles.outlineButton} ${styles.refreshButton}`}
              type="button"
              onClick={handleRefreshAll}
              disabled={submitting}
              title="Refresh all repositories"
            >
              <RefreshCw className={submitting ? styles.refreshingIcon : undefined} size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <Loader label="Loading repositories..." />
        ) : (
          <Table
            columns={repositoryColumns}
            data={filteredRepositories}
            emptyState={
              repositories.length === 0 ? (
                <div className={styles.repositoryEmptyState}>
                  <EmptyState
                    title="No repositories found"
                    description="Connected repositories will appear here after you add or upload one."
                  />
                </div>
              ) : (
                <EmptyState
                  title="No repositories match your search."
                  description="Try a different repository name, provider, branch, or language."
                />
              )
            }
            getRowKey={(repository) => repository.id}
            tableClassName={styles.table}
            wrapperClassName={styles.tableWrap}
          />
        )}
      </section>
      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        title="Remove repository"
        message={`Remove "${confirmDeleteName}"? This cannot be undone.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmedDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

export default RepositoryOnboardPage;
