import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, SearchInput } from "../components/common";
import Card from "../components/common/Card";
import Loader from "../components/common/Loader";
import {
  getAssignedRepositories,
  type RepositoryListResponse,
} from "../services/repositoryService";
import styles from "./Dashboard.module.css";

function badgeClass(status: string) {
  if (status === "indexed") return `${styles.badge} ${styles.badgeActive}`;
  if (status === "indexing") return `${styles.badge} ${styles.badgeReview}`;
  if (status === "error") return `${styles.badge} ${styles.badgeError}`;
  return `${styles.badge} ${styles.badgePending}`;
}

function truncate(value: string, maxLength = 40) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function LearnerRepositories() {
  const navigate = useNavigate();
  const [assignedRepositories, setAssignedRepositories] = useState<RepositoryListResponse | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");

    getAssignedRepositories()
      .then((data) => {
        if (isMounted) setAssignedRepositories(data);
      })
      .catch(() => {
        if (isMounted) setError("Repositories could not be loaded.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredAssignedRepositories = useMemo(() => {
    const repositories = assignedRepositories?.repositories || [];
    const query = search.toLowerCase().trim();
    if (!query) return repositories;
    return repositories.filter(
      (repository) =>
        repository.name.toLowerCase().includes(query) ||
        (repository.url || "").toLowerCase().includes(query) ||
        (repository.language || "").toLowerCase().includes(query),
    );
  }, [assignedRepositories?.repositories, search]);

  if (isLoading) {
    return <Card className={styles.state}><Loader label="Loading repositories..." /></Card>;
  }

  if (error) {
    return <Card className={styles.state}>{error}</Card>;
  }

  return (
    <div className={styles.page}>
      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Repositories</h2>
            <p>{filteredAssignedRepositories.length} repositories matched</p>
          </div>
          <div className={styles.panelActions}>
            <SearchInput
              aria-label="Search repositories"
              wrapperClassName={styles.search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search repositories"
              value={search}
            />
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Repository Name</th>
                <th>URL/Source</th>
                <th>Language</th>
                <th>Modules</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssignedRepositories.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title="No assigned repositories" description="No repositories matched your search." />
                  </td>
                </tr>
              ) : null}
              {filteredAssignedRepositories.map((repository) => (
                <tr key={repository.id}>
                  <td>
                    <div className={styles.projectName}>{repository.name}</div>
                  </td>
                  <td className={styles.repository}>{truncate(repository.url || `upload/${repository.name}`)}</td>
                  <td>{repository.language || "Unknown"}</td>
                  <td>{repository.module_count}</td>
                  <td>
                    <span className={badgeClass(repository.status)}>{repository.status}</span>
                  </td>
                  <td>
                    <button
                      className={styles.action}
                      onClick={() => navigate(`/repositories/${repository.id}`)}
                      type="button"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default LearnerRepositories;
