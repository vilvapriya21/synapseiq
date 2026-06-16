import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/common";
import { getUsers, type AdminUser } from "../services/adminService";
import {
  assignLearner,
  getKnowledgeBase,
  getRepository,
  getRepositoryAssignments,
  refreshRepository,
  unassignLearner,
  type KnowledgeBaseEntry,
  type KnowledgeBaseResponse,
  type Repository,
  type RepositoryAssignment,
} from "../services/repositoryService";
import { useAuthStore } from "../store/authStore";
import { normalizeRole } from "../utils/roles";
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
  const user = useAuthStore((state) => state.user);
  const role = normalizeRole(user?.roles[0]);
  const [repository, setRepository] = useState<Repository | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBaseResponse | null>(null);
  const [assignments, setAssignments] = useState<RepositoryAssignment[]>([]);
  const [learnerEmail, setLearnerEmail] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("file_tree");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchAssignments = async () => {
    if (!repoId || role !== "ADMIN") {
      return;
    }

    try {
      const response = await getRepositoryAssignments(repoId);
      setAssignments(response);
      setAssignmentError("");
    } catch {
      setAssignmentError("Unable to load assigned learners.");
    }
  };

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
    fetchAssignments();
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
    try {
      await refreshRepository(repoId);
      await fetchRepositoryData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAssignLearner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repoId || !learnerEmail.trim()) {
      return;
    }

    setAssignmentSaving(true);
    setAssignmentError("");
    try {
      const users = await getUsers();
      const learner = users.find(
        (candidate: AdminUser) =>
          candidate.role === "learner" &&
          candidate.email.toLowerCase() === learnerEmail.trim().toLowerCase(),
      );
      if (!learner) {
        setAssignmentError("Learner not found for that email.");
        return;
      }

      await assignLearner(repoId, learner.id);
      setLearnerEmail("");
      await fetchAssignments();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setAssignmentError(axiosError.response?.data?.detail || "Unable to assign learner.");
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleUnassignLearner = async (learnerId: string) => {
    if (!repoId) {
      return;
    }

    setAssignmentSaving(true);
    setAssignmentError("");
    try {
      await unassignLearner(repoId, learnerId);
      await fetchAssignments();
    } catch {
      setAssignmentError("Unable to unassign learner.");
    } finally {
      setAssignmentSaving(false);
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

        <aside className={styles.sideColumn}>
          <div className={styles.card}>
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
          </div>

          {role === "ADMIN" ? (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Assigned Learners</h2>
              </div>

              <div className={styles.assignmentList}>
                {assignments.map((learner) => (
                  <div className={styles.assignmentItem} key={learner.id}>
                    <div>
                      <strong>{learner.name}</strong>
                      <span>{learner.email}</span>
                    </div>
                    <button
                      className={styles.dangerButton}
                      type="button"
                      onClick={() => handleUnassignLearner(learner.id)}
                      disabled={assignmentSaving}
                    >
                      Unassign
                    </button>
                  </div>
                ))}
                {assignments.length === 0 ? <p className={styles.muted}>No learners assigned yet.</p> : null}
              </div>

              <form className={styles.assignForm} onSubmit={handleAssignLearner}>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="Learner email"
                  value={learnerEmail}
                  onChange={(event) => setLearnerEmail(event.target.value)}
                />
                <button className={styles.outlineButton} type="submit" disabled={assignmentSaving}>
                  Assign Learner
                </button>
              </form>

              {assignmentError ? <p className={styles.errorText}>{assignmentError}</p> : null}
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

export default RepositoryPage;
