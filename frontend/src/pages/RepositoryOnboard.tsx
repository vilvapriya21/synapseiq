import { FormEvent, useEffect, useRef, useState } from "react";
import { CloudUpload, SquareCode } from "lucide-react";
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
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConnectError("");

    if (!url.startsWith("https://github.com/")) {
      setConnectError("Repository URL must start with https://github.com/.");
      return;
    }

    setSubmitting(true);
    try {
      await connectRepository(url, branch || "main");
      setUrl("");
      setBranch("main");
      await fetchRepositories();
    } catch {
      setConnectError("Unable to connect repository.");
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
    } catch {
      setConnectError("Unable to refresh repositories.");
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
              <p>Connect via OAuth or PAT</p>
            </div>
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
                        {repository.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className={styles.viewButton}
                        type="button"
                        onClick={() => console.log(repository.id)}
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
