import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/common";
import {
  getKnowledgeBase,
  getRepository,
  refreshRepository,
  type KnowledgeBaseEntry,
  type KnowledgeBaseResponse,
  type Repository,
} from "../services/repositoryService";
import styles from "./Repository.module.css";

type TabKey = "file_tree" | "readme" | "dependencies";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "file_tree", label: "File Tree" },
  { key: "readme", label: "README" },
  { key: "dependencies", label: "Dependencies" },
];

function getStatusClass(status: Repository["status"] | Repository["knowledge_base_status"]) {
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

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function RepositoryPage() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const [repository, setRepository] = useState<Repository | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("file_tree");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchRepositoryData = async () => {
    if (!repoId) {
      return;
    }

    setLoading(true);
    try {
      const [repositoryResponse, knowledgeBaseResponse] = await Promise.all([
        getRepository(repoId),
        getKnowledgeBase(repoId),
      ]);
      setRepository(repositoryResponse);
      setKnowledgeBase(knowledgeBaseResponse);
      setError("");
    } catch {
      setError("Unable to load repository details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepositoryData();
  }, [repoId]);

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
    try {
      await refreshRepository(repoId);
      await fetchRepositoryData();
    } finally {
      setRefreshing(false);
    }
  };

  const entries = knowledgeBase?.entries ?? [];
  const fileTreeEntry = findEntry(entries, "file_tree");
  const readmeEntry = findEntry(entries, "readme");
  const dependencyEntries = entries.filter((entry) => entry.entry_type === "dependencies");

  const renderTabContent = () => {
    if (activeTab === "file_tree") {
      return fileTreeEntry ? (
        <pre className={styles.codeBlock}>{fileTreeEntry.content}</pre>
      ) : (
        <p className={styles.muted}>Not found in this repository</p>
      );
    }

    if (activeTab === "readme") {
      return readmeEntry ? (
        <pre className={styles.codeBlock}>{readmeEntry.content}</pre>
      ) : (
        <p className={styles.muted}>Not found in this repository</p>
      );
    }

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
  };

  if (loading && !repository) {
    return <div className={styles.state}>Loading repository&hellip;</div>;
  }

  if (error || !repository) {
    return <div className={styles.state}>{error || "Repository not found."}</div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.headerCard}>
        <button className={styles.backButton} type="button" onClick={() => navigate("/repositories")}>
          &#8592; Repositories
        </button>
        <div className={styles.headerMain}>
          <div>
            <h1>{repository.name}</h1>
            {repository.url ? (
              <a className={styles.repoUrl} href={repository.url} rel="noreferrer" target="_blank">
                {repository.url}
              </a>
            ) : (
              <span className={styles.repoUrl}>Local upload</span>
            )}
          </div>
          <span className={`${styles.badge} ${getStatusClass(repository.status)}`}>{repository.status}</span>
        </div>
        <div className={styles.stats}>
          <span className={`${styles.statChip} ${styles.providerChip}`}>{repository.provider}</span>
          <span className={styles.statChip}>Language: {repository.language || "-"}</span>
          <span className={styles.statChip}>Modules: {repository.module_count}</span>
          <span className={styles.statChip}>Files: {repository.file_count}</span>
        </div>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Knowledge Base</h2>
            <span className={`${styles.badge} ${getStatusClass(repository.knowledge_base_status)}`}>
              {repository.knowledge_base_status}
            </span>
          </div>

          {repository.knowledge_base_status === "none" ? (
            <EmptyState
              title="Analysis pending"
              description="Knowledge base will be generated after indexing"
            />
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

        <aside className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Repository Info</h2>
          </div>
          <dl className={styles.infoList}>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(repository.created_at)}</dd>
            </div>
            <div>
              <dt>Source type</dt>
              <dd>{repository.source_type}</dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>{repository.branch || "-"}</dd>
            </div>
            <div>
              <dt>Knowledge base entries</dt>
              <dd>{knowledgeBase?.total ?? 0}</dd>
            </div>
          </dl>
          <button className={styles.outlineButton} type="button" onClick={handleReanalyze} disabled={refreshing}>
            Re-analyze
          </button>
        </aside>
      </section>
    </div>
  );
}

export default RepositoryPage;
