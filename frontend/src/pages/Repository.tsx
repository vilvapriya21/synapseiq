import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatPanel from "../components/ChatPanel";
import KTChecklist from "../components/KTChecklist";
import { EmptyState } from "../components/common";
import { getUsers, type AdminUser } from "../services/adminService";
import {
  analyzeContributors,
  assignLearner,
  createKTTopic,
  deleteKTTopic,
  getAssignments,
  getContributors,
  getKTTopics,
  getKnowledgeBase,
  getMyAssignments,
  getRepository,
  getTopicRecommendation,
  refreshRepository,
  unassignLearner,
  type Assignment,
  type Contributor,
  type KnowledgeBaseEntry,
  type KnowledgeBaseResponse,
  type KTTopic,
  type Repository,
  type RecommendedContributor,
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
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [analyzingContributors, setAnalyzingContributors] = useState(false);
  const [contributorError, setContributorError] = useState("");
  const [topics, setTopics] = useState<KTTopic[]>([]);
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [topicPaths, setTopicPaths] = useState("");
  const [recommendations, setRecommendations] = useState<Record<string, RecommendedContributor[]>>({});
  const [expandedChecklistTopicIds, setExpandedChecklistTopicIds] = useState<Record<string, boolean>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [learners, setLearners] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [assignError, setAssignError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("file_tree");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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
          .filter((assignment) => assignment.repository_id === repoId)
          .map((assignment) => ({
            id: assignment.kt_topic_id,
            repository_id: assignment.repository_id,
            title: assignment.kt_topic_title,
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
    try {
      await refreshRepository(repoId);
      await fetchRepositoryData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAnalyzeContributors = async () => {
    if (!repoId) {
      return;
    }

    setAnalyzingContributors(true);
    setContributorError("");
    try {
      const result = await analyzeContributors(repoId);
      setContributors(result.contributors);
    } catch {
      setContributorError("Failed to analyze contributors. The repository may be too large or access was denied.");
    } finally {
      setAnalyzingContributors(false);
    }
  };

  const handleCreateTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repoId) {
      return;
    }

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
    if (!repoId || !selectedTopicId || !selectedLearnerId) {
      return;
    }

    setAssignError("");
    try {
      await assignLearner(repoId, selectedTopicId, selectedLearnerId);
      const result = await getAssignments(repoId);
      setAssignments(result.assignments);
      setSelectedTopicId("");
      setSelectedLearnerId("");
    } catch {
      setAssignError("Failed to assign learner. They may already be assigned to this topic.");
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
        <button
          className={styles.backButton}
          type="button"
          onClick={() => navigate(role === "LEARNER" ? "/dashboard" : "/repositories")}
        >
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

      <div className={styles.workspaceLayout}>
        <div className={styles.workspaceMain}>
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
          {repository.knowledge_base_status === "ready" ? renderTabContent() : null}
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
            </aside>
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
            <button className={styles.primaryButton} type="submit">Create Topic</button>
          </form>
        ) : null}

        {topics.length === 0 ? (
          <p className={styles.emptyText}>
            {role === "ADMIN"
              ? "No KT topics yet. Add one to start organizing knowledge transfer."
              : "No KT topics assigned yet."}
          </p>
        ) : (
          <div className={styles.topicList}>
            {topics.map((topic) => (
              <div key={topic.id} className={styles.topicItem}>
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
                      <button className={styles.deleteButton} onClick={() => handleDeleteTopic(topic.id)} type="button">
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
                {recommendations[topic.id] ? (
                  <div className={styles.recommendationBox}>
                    {recommendations[topic.id].length === 0 ? (
                      <p className={styles.emptyText}>
                        No matching contributors found. Run "Analyze Contributors" first, or check the path patterns.
                      </p>
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
              <h2>Contributors</h2>
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
              <p className={styles.emptyText}>
                No contributor data yet. Click "Analyze Contributors" to extract commit history.
              </p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Commits</th>
                  </tr>
                </thead>
                <tbody>
                  {contributors.map((contributor) => (
                    <tr key={contributor.id}>
                      <td>{contributor.name}</td>
                      <td>{contributor.email}</td>
                      <td>{contributor.commit_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
              </section>

              <section className={styles.card}>
            <h2>Assigned Learners</h2>

            <div className={styles.assignForm}>
              <select
                className={styles.input}
                value={selectedTopicId}
                onChange={(event) => setSelectedTopicId(event.target.value)}
              >
                <option value="">Select KT Topic...</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>{topic.title}</option>
                ))}
              </select>
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
              <button className={styles.primaryButton} onClick={handleAssign} type="button">Assign</button>
            </div>
            {assignError ? <p className={styles.error}>{assignError}</p> : null}

            {assignments.length === 0 ? (
              <p className={styles.emptyText}>No learners assigned yet.</p>
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
                      <td>{assignment.kt_topic_title}</td>
                      <td>{assignment.status}</td>
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
        </div>

        <aside className={styles.workspaceSidebar}>
          {repoId ? <ChatPanel repoId={repoId} /> : null}
        </aside>
      </div>
    </div>
  );
}

export default RepositoryPage;
