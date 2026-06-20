import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, FolderGit2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState, Loader, PageHero } from "../components/common";
import { ROUTES } from "../routes/routePaths";
import { getMyAssignments, type MyAssignment } from "../services/repositoryService";
import styles from "./MyRepositories.module.css";

type RepositoryAssignmentGroup = {
  repositoryId: string;
  repositoryName: string;
  assignments: MyAssignment[];
};

const GENERAL_LEARNING_LABEL = "General repository learning";

function getTopicLabel(assignment: MyAssignment) {
  return assignment.kt_topic_title?.trim() || GENERAL_LEARNING_LABEL;
}

function getStatusClass(status: string) {
  const normalized = status.toLowerCase();
  if (["completed", "complete", "done"].includes(normalized)) {
    return styles.statusComplete;
  }
  if (["in_progress", "in progress", "active"].includes(normalized)) {
    return styles.statusActive;
  }
  return styles.statusPending;
}

function groupAssignments(assignments: MyAssignment[]): RepositoryAssignmentGroup[] {
  const groups = new Map<string, RepositoryAssignmentGroup>();

  assignments.forEach((assignment) => {
    const existing = groups.get(assignment.repository_id);
    if (existing) {
      existing.assignments.push(assignment);
      return;
    }

    groups.set(assignment.repository_id, {
      repositoryId: assignment.repository_id,
      repositoryName: assignment.repository_name,
      assignments: [assignment],
    });
  });

  return Array.from(groups.values()).sort((left, right) =>
    left.repositoryName.localeCompare(right.repositoryName, undefined, { sensitivity: "base" }),
  );
}

function MyRepositories() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<MyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadAssignments() {
      setLoading(true);
      setError("");
      try {
        const rows = await getMyAssignments();
        if (isMounted) {
          setAssignments(rows);
        }
      } catch {
        if (isMounted) {
          setError("Unable to load assigned repositories.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadAssignments();

    return () => {
      isMounted = false;
    };
  }, []);

  const repositoryGroups = useMemo(() => groupAssignments(assignments), [assignments]);

  const openRepository = (repositoryId: string) => {
    navigate(ROUTES.repositoryDetail.replace(":repoId", repositoryId));
  };

  const continueTopic = (assignment: MyAssignment) => {
    const repositoryPath = ROUTES.repositoryDetail.replace(":repoId", assignment.repository_id);
    if (!assignment.kt_topic_id) {
      navigate(repositoryPath);
      return;
    }

    navigate(`${repositoryPath}?topicId=${encodeURIComponent(assignment.kt_topic_id)}`, {
      state: { topicId: assignment.kt_topic_id },
    });
  };

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow="Repositories"
        heading="My Repositories"
        subtitle="Codebases assigned to you for knowledge transfer"
      />

      {loading ? <Loader label="Loading assigned repositories..." /> : null}

      {!loading && error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {!loading && !error && repositoryGroups.length === 0 ? (
        <EmptyState title="No repositories assigned yet." description="Contact your admin." />
      ) : null}

      {!loading && !error && repositoryGroups.length > 0 ? (
        <section className={styles.repositoryGrid} aria-label="Assigned repositories">
          {repositoryGroups.map((group) => (
            <article className={styles.repositoryCard} key={group.repositoryId}>
              <div className={styles.repositoryHeader}>
                <span className={styles.repositoryIcon} aria-hidden="true">
                  <FolderGit2 size={20} />
                </span>
                <div className={styles.repositoryTitleBlock}>
                  <button
                    className={styles.repositoryTitle}
                    type="button"
                    onClick={() => openRepository(group.repositoryId)}
                    title={group.repositoryName}
                  >
                    {group.repositoryName}
                  </button>
                  <span className={styles.repositoryMeta}>
                    {group.assignments.length} assigned {group.assignments.length === 1 ? "topic" : "topics"}
                  </span>
                </div>
              </div>

              <div className={styles.topicList}>
                {group.assignments.map((assignment) => (
                  <div className={styles.topicRow} key={assignment.assignment_id}>
                    <div className={styles.topicIcon} aria-hidden="true">
                      <BookOpen size={16} />
                    </div>
                    <div className={styles.topicContent}>
                      <div className={styles.topicTopline}>
                        <strong title={getTopicLabel(assignment)}>{getTopicLabel(assignment)}</strong>
                        <span className={`${styles.statusBadge} ${getStatusClass(assignment.status)}`}>
                          {assignment.status}
                        </span>
                      </div>
                      {assignment.kt_topic_description ? (
                        <p title={assignment.kt_topic_description}>{assignment.kt_topic_description}</p>
                      ) : null}
                    </div>
                    <button
                      className={styles.continueButton}
                      type="button"
                      onClick={() => continueTopic(assignment)}
                    >
                      Continue
                      <ArrowRight size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export default MyRepositories;
