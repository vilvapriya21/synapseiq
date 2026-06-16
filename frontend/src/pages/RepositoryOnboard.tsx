import { FormEvent, useEffect, useRef, useState } from "react";
import { CloudUpload, SquareCode } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { ENV } from "../constants/env";
import {
  connectRepository,
  deleteRepository,
  listRepositories,
  refreshRepository,
  uploadRepository,
} from "../services/repositoryService";
import apiClient from "../services/api";
import type { Repository } from "../services/repositoryService";
import styles from "./RepositoryOnboard.module.css";

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
  const [githubStatus, setGithubStatus] = useState<"unknown" | "connected" | "disconnected">("unknown");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [azureStatus, setAzureStatus] = useState<"connected" | "disconnected" | "unknown">("unknown");
  const [azurePat, setAzurePat] = useState("");
  const [azurePatSaving, setAzurePatSaving] = useState(false);

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
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("github") === "connected") {
      setGithubStatus("connected");
      window.history.replaceState({}, "", location.pathname);
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
          reason: getStatusReason(repository),
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

    if (!url.startsWith("https://")) {
      setConnectError("Repository URL must start with https://");
      return;
    }

    setSubmitting(true);
    try {
      await connectRepository(url, branch || "main");
      setUrl("");
      setBranch("main");
      await fetchRepositories();
    } catch (err: unknown) {
      console.error("[RepositoryOnboard] Connect repository failed", err);
      const axiosError = err as { response?: { data?: { detail?: string } } };
      const detail = axiosError?.response?.data?.detail ?? "";
      if (detail.toLowerCase().includes("not found") || detail.toLowerCase().includes("403")) {
        setConnectError(
          "Repository not found or access denied. Connect your GitHub account above to access private repositories."
        );
      } else {
        setConnectError(detail || "Unable to connect repository.");
      }
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
    } catch {
      setUploadError("Unable to upload repository.");
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
      const axiosError = err as { response?: { data?: { detail?: string } } };
      const detail = axiosError?.response?.data?.detail ?? "";
      if (detail.toLowerCase().includes("not found") || detail.toLowerCase().includes("403")) {
        setConnectError(
          "Repository not found or access denied. Connect your GitHub account above to access private repositories."
        );
      } else {
        setConnectError(detail || "Unable to refresh repositories.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (repoId: string) => {
    if (!window.confirm("Remove this repository? This cannot be undone.")) return;
    setDeletingId(repoId);
    try {
      await deleteRepository(repoId);
      await fetchRepositories();
    } catch {
      setConnectError("Failed to remove repository.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveAzurePat = async () => {
    if (!azurePat.trim()) return;
    setAzurePatSaving(true);
    try {
      await apiClient.post(`/auth/azure/pat?pat=${encodeURIComponent(azurePat)}`);
      setAzureStatus("connected");
      setAzurePat("");
    } catch {
      setConnectError("Failed to save Azure PAT.");
    } finally {
      setAzurePatSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.heading}>Repository Onboarding</h1>
          <p className={styles.subtitle}>Connect source code repositories to begin knowledge extraction</p>
        </div>
      </header>

      <section className={styles.connectGrid}>
        <form className={styles.card} onSubmit={handleConnect}>
          <div className={styles.cardHeader}>
            <div className={`${styles.iconBox} ${styles.githubIcon}`}>
              <SquareCode size={22} />
            </div>
            <div>
              <h2>GitHub</h2>
              <p>Connect your GitHub account to access private repos</p>
            </div>
          </div>

          <button
            className={styles.secondaryButton}
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                          background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6,
                          padding: "8px 12px", marginBottom: 8 }}>
              <span style={{ color: "#15803D", fontSize: 13, fontWeight: 500 }}>
                &#10003; GitHub connected &mdash; private repositories enabled
              </span>
              <button
                type="button"
                style={{ background: "none", border: "none", color: "#6B7280",
                         fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
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
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6,
                          padding: "8px 12px", marginBottom: 8, fontSize: 13, color: "#92400E" }}>
              &#9888; GitHub not connected &mdash; only public repositories will work
            </div>
          ) : null}

          <div style={{ alignItems: "center", color: "#6b7280", display: "flex", gap: 10, fontSize: 12 }}>
            <span style={{ background: "#e5e7eb", flex: 1, height: 1 }} />
            <span>or enter a repository URL directly</span>
            <span style={{ background: "#e5e7eb", flex: 1, height: 1 }} />
          </div>

          <div className={styles.formGrid}>
            <input
              className={styles.input}
              type="text"
              placeholder="https://github.com/org/repo"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <input
              className={styles.input}
              type="text"
              placeholder="main"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
            />
          </div>

          {connectError ? <p className={styles.error}>{connectError}</p> : null}

          <button className={styles.primaryButton} type="submit" disabled={submitting}>
            Connect Repository
          </button>
        </form>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={`${styles.iconBox} ${styles.uploadIcon}`}>
              <SquareCode size={22} />
            </div>
            <div>
              <h2>Azure DevOps</h2>
              <p>Connect with a Personal Access Token</p>
            </div>
          </div>

          {azureStatus === "connected" ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                          background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6,
                          padding: "8px 12px", marginBottom: 8 }}>
              <span style={{ color: "#15803D", fontSize: 13, fontWeight: 500 }}>
                &#10003; Azure DevOps connected
              </span>
              <button
                type="button"
                style={{ background: "none", border: "none", color: "#6B7280",
                         fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
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
            <>
              <input
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
                disabled={azurePatSaving}
              >
                Save PAT
              </button>
              <p style={{ color: "#6B7280", fontSize: 12, margin: 0 }}>
                Generate at dev.azure.com &rarr; User Settings &rarr; Personal Access Tokens. Needs Code (Read) scope.
              </p>
            </>
          ) : null}
        </div>

        <div className={styles.card}>
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

          {uploadError ? <p className={styles.error}>{uploadError}</p> : null}

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
      </section>

      <section className={styles.repositoryCard}>
        <div className={styles.repositoryHeader}>
          <h2>Connected Repositories</h2>
          <button className={styles.outlineButton} type="button" onClick={handleRefreshAll} disabled={submitting}>
            &#8634; Refresh All
          </button>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading repositories&hellip;</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Branch</th>
                  <th>Language</th>
                  <th>Modules</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {repositories.map((repository) => (
                  <tr key={repository.id}>
                    <td>
                      <div className={styles.repositoryName}>{repository.name}</div>
                      <div className={styles.repositorySource}>{repository.source_type}</div>
                    </td>
                    <td>{repository.branch || "-"}</td>
                    <td>{repository.language || "-"}</td>
                    <td>{repository.module_count}</td>
                    <td>
                      <span className={`${styles.badge} ${getStatusClass(repository.status)}`}>
                        {repository.status === "indexing" ? (
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            width="12"
                            height="12"
                            style={{ marginRight: 6 }}
                          >
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
                        {repository.status}
                      </span>
                      {repository.status === "error" && repository.error_message ? (
                        <span title={repository.error_message}> &#9888;</span>
                      ) : null}
                      {getStatusReason(repository) ? (
                        <div className={styles.statusReason}>{getStatusReason(repository)}</div>
                      ) : null}
                    </td>
                    <td>
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
                        className={styles.deleteButton}
                        type="button"
                        onClick={() => handleDelete(repository.id)}
                        disabled={deletingId === repository.id}
                        title="Remove repository"
                      >
                        {deletingId === repository.id ? "…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default RepositoryOnboardPage;
