import { FormEvent, useEffect, useRef, useState } from "react";
import { CloudUpload, SquareCode } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  connectRepository,
  listRepositories,
  refreshRepository,
  uploadRepository,
} from "../services/repositoryService";
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
  const [githubConnected, setGithubConnected] = useState(false);

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
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("github") === "connected") {
      setGithubConnected(true);
      window.history.replaceState({}, "", location.pathname);
    }
  }, []);

  useEffect(() => {
    const hasTransientRepository = repositories.some((repository) =>
      ["pending", "indexing"].includes(repository.status)
    );

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
              window.location.href = `${import.meta.env.VITE_API_BASE_URL}/auth/github`;
            }}
          >
            Connect GitHub Account
          </button>

          <div style={{ alignItems: "center", color: "#6b7280", display: "flex", gap: 10, fontSize: 12 }}>
            <span style={{ background: "#e5e7eb", flex: 1, height: 1 }} />
            <span>or enter a repository URL directly</span>
            <span style={{ background: "#e5e7eb", flex: 1, height: 1 }} />
          </div>

          {githubConnected ? (
            <p style={{ color: "#059669", fontSize: 12, margin: "0 0 8px" }}>
              &#10003; GitHub account connected &mdash; you can now access private repositories
            </p>
          ) : null}

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
