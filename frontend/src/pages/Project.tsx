import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Loader } from "../components/common";
import Card from "../components/common/Card";
import Input from "../components/common/Input";
import { ROUTES } from "../routes/routePaths";
import {
  getAssignedRepositories,
  getMyAssignments,
  listRepositories,
  type MyAssignment,
  type Repository,
} from "../services/repositoryService";
import { useAuthStore } from "../store/authStore";
import { normalizeRole } from "../utils/roles";
import styles from "./Project.module.css";

type BadgeTone = "indexed" | "indexing" | "error" | "pending";

function formatCount(count: number, label: string) {
  return `${count.toLocaleString()} ${label}${count === 1 ? "" : "s"}`;
}

function formatDate(value?: string) {
  if (!value) return "Not available";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getKnowledgeLabel(status: Repository["knowledge_base_status"]) {
  if (status === "ready") return "Knowledge ready";
  if (status === "building") return "Knowledge building";
  if (status === "error") return "Knowledge error";
  return "Knowledge pending";
}

function getBadgeTone(repository: Repository): BadgeTone {
  if (repository.status === "error" || repository.knowledge_base_status === "error") return "error";
  if (repository.status === "indexed" || repository.knowledge_base_status === "ready") return "indexed";
  if (repository.status === "indexing" || repository.knowledge_base_status === "building") return "indexing";
  return "pending";
}

function fallbackRepositoriesFromAssignments(assignments: MyAssignment[]): Repository[] {
  const repositories = new Map<string, Repository>();

  assignments.forEach((assignment) => {
    if (!repositories.has(assignment.repository_id)) {
      repositories.set(assignment.repository_id, {
        id: assignment.repository_id,
        name: assignment.repository_name,
        source_type: "git",
        module_count: 0,
        file_count: 0,
        status: "pending",
        knowledge_base_status: "none",
        created_at: assignment.assigned_at,
      });
    }
  });

  return Array.from(repositories.values());
}

function ProjectPage() {
  const navigate = useNavigate();
  const role = normalizeRole(useAuthStore((state) => state.user?.roles[0]));
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadRepositories() {
      setIsLoading(true);
      setError("");

      try {
        if (role === "ADMIN") {
          const response = await listRepositories();
          if (isMounted) setRepositories(response.repositories);
          return;
        }

        try {
          const response = await getAssignedRepositories();
          if (isMounted) setRepositories(response.repositories);
        } catch {
          const assignments = await getMyAssignments();
          if (isMounted) setRepositories(fallbackRepositoriesFromAssignments(assignments));
        }
      } catch (err) {
        console.error("[ProjectWorkspace] Repository load failed", err);
        if (isMounted) {
          setError("Project Workspace could not load repositories. Please try again.");
          setRepositories([]);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadRepositories();

    return () => {
      isMounted = false;
    };
  }, [role]);

  const filteredRepositories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return repositories;

    return repositories.filter((repository) =>
      [
        repository.name,
        repository.provider,
        repository.language,
        repository.branch,
        repository.url,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [repositories, search]);

  const openRepository = (repoId: string) => {
    navigate(ROUTES.repositoryDetail.replace(":repoId", repoId));
  };

  const emptyMessage =
    role === "ADMIN"
      ? "No repositories connected yet."
      : "No repositories assigned yet. Please contact your admin.";

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Repositories</p>
          <h1 className={styles.heading}>Project Workspace</h1>
          <p className={styles.subtitle}>
            {role === "ADMIN"
              ? "View and manage connected codebases."
              : "Open repositories assigned to you for knowledge transfer."}
          </p>
        </div>
        {role === "ADMIN" && (
          <Button className={styles.connectButton} type="button" onClick={() => navigate(ROUTES.repositoryOnboard)}>
            Connect Repository
          </Button>
        )}
      </section>

      <Card className={styles.toolbar} aria-label="Repository filters">
        <div className={styles.searchBox}>
          <span aria-hidden="true">Search</span>
          <Input
            aria-label="Search repositories"
            className={styles.searchInput}
            fieldClassName={styles.searchField}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search repositories..."
            type="search"
          />
        </div>
        <p className={styles.count}>{formatCount(filteredRepositories.length, "repository")}</p>
      </Card>

      {isLoading && <Loader label="Loading repositories..." />}

      {!isLoading && error && <EmptyState title="Unable to load repositories" description={error} />}

      {!isLoading && !error && filteredRepositories.length === 0 && (
        repositories.length === 0 ? (
          <div className={styles.repositoryEmptyState}>
            <EmptyState
              title={emptyMessage}
              description="Repositories will appear here once they are connected and available."
              action={
                role === "ADMIN" ? (
                  <Button type="button" onClick={() => navigate(ROUTES.repositoryOnboard)}>
                    Connect Repository
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <EmptyState
            title="No repositories match your search."
            description="Try a different repository name, provider, branch, or language."
          />
        )
      )}

      {!isLoading && !error && filteredRepositories.length > 0 && (
        <section className={styles.list} aria-label="Repository list">
          {filteredRepositories.map((repository) => {
            const badgeTone = getBadgeTone(repository);
            const source = repository.provider || repository.source_type || "Repository";

            return (
              <Card
                className={styles.repoCard}
                key={repository.id}
                onClick={() => openRepository(repository.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openRepository(repository.id);
                  }
                }}
              >
                <div className={styles.repoMain}>
                  <div>
                    <h2>{repository.name}</h2>
                    <p>{repository.url || "Uploaded repository"}</p>
                  </div>
                  <span className={`${styles.badge} ${styles[badgeTone]}`}>{repository.status}</span>
                </div>

                <div className={styles.metaGrid}>
                  <div>
                    <span>Provider</span>
                    <strong>{source}</strong>
                  </div>
                  <div>
                    <span>Branch</span>
                    <strong>{repository.branch || "Default"}</strong>
                  </div>
                  <div>
                    <span>Language</span>
                    <strong>{repository.language || "Mixed"}</strong>
                  </div>
                  <div>
                    <span>Modules</span>
                    <strong>{repository.module_count.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Files</span>
                    <strong>{(repository.file_count ?? 0).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Knowledge Base</span>
                    <strong>{getKnowledgeLabel(repository.knowledge_base_status)}</strong>
                  </div>
                  <div>
                    <span>Created</span>
                    <strong>{formatDate(repository.created_at)}</strong>
                  </div>
                </div>

                <div className={styles.cardFooter}>
                  {repository.error_message && <p>{repository.error_message}</p>}
                  <button
                    className={styles.viewButton}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openRepository(repository.id);
                    }}
                  >
                    View
                  </button>
                </div>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}

export default ProjectPage;
