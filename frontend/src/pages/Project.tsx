import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, EmptyState, Modal } from "../components/common";
import { ROUTES } from "../routes/routePaths";
import { workspaceService } from "../services/workspaceService";
import { useAuthStore } from "../store/authStore";
import { AssignmentStatus, ChecklistStatus, KTAssignment, WorkspaceResponse } from "../types";
import { normalizeRole } from "../utils/roles";
import styles from "./Project.module.css";

type WorkspaceTab = "Overview" | "KT Checklist" | "SME Recommendations" | "KT Assignments" | "Knowledge Base";

const checklistFilters: Array<ChecklistStatus | "All"> = ["All", "Not Started", "In Progress", "Completed"];
const assignmentStatuses: AssignmentStatus[] = ["Assigned", "In Progress", "Completed", "Overdue"];

function ProjectPage() {
  const { projectId = "alpha-payments" } = useParams();
  const navigate = useNavigate();
  const role = normalizeRole(useAuthStore((state) => state.user?.roles[0]));
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("Overview");
  const [checklistFilter, setChecklistFilter] = useState<ChecklistStatus | "All">("All");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [expandedDocs, setExpandedDocs] = useState<Record<string, boolean>>({});
  const [editingAssignment, setEditingAssignment] = useState<KTAssignment | null>(null);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    workspaceService
      .getWorkspace(projectId)
      .then((data) => {
        if (isMounted) {
          setWorkspace(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Project workspace could not be loaded.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const tabs: WorkspaceTab[] = role === "ADMIN"
    ? ["Overview", "KT Checklist", "SME Recommendations", "KT Assignments", "Knowledge Base"]
    : ["Overview", "KT Checklist", "SME Recommendations", "Knowledge Base"];

  const filteredChecklist = useMemo(() => {
    const items = workspace?.checklist ?? [];
    return checklistFilter === "All" ? items : items.filter((item) => item.status === checklistFilter);
  }, [checklistFilter, workspace?.checklist]);

  const filteredDocuments = useMemo(() => {
    const documents = workspace?.knowledgeBase ?? [];
    const query = knowledgeSearch.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter(
      (document) =>
        document.title.toLowerCase().includes(query) ||
        document.section.toLowerCase().includes(query) ||
        document.content.toLowerCase().includes(query),
    );
  }, [knowledgeSearch, workspace?.knowledgeBase]);

  const refreshAssignments = async () => {
    const nextWorkspace = await workspaceService.getWorkspace(projectId);
    setWorkspace(nextWorkspace);
  };

  const handleAssignmentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const assignment: KTAssignment = {
      id: editingAssignment?.id ?? "",
      sme: String(formData.get("sme") || "").trim(),
      learner: String(formData.get("learner") || "").trim(),
      dueDate: String(formData.get("dueDate") || ""),
      status: String(formData.get("status") || "Assigned") as AssignmentStatus,
    };

    if (editingAssignment) {
      await workspaceService.updateAssignment(assignment);
    } else {
      await workspaceService.createAssignment(assignment);
    }

    setIsAssignmentModalOpen(false);
    setEditingAssignment(null);
    await refreshAssignments();
  };

  const handleCancelAssignment = async (assignmentId: string) => {
    await workspaceService.cancelAssignment(assignmentId);
    await refreshAssignments();
  };

  if (isLoading) {
    return <div className={styles.state}>Loading project workspace...</div>;
  }

  if (error || !workspace) {
    return <div className={styles.state}>{error || "No project workspace data available."}</div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Project Workspace</p>
          <h1 className={styles.heading}>{projectId}</h1>
        </div>
        <div className={styles.actions}>
          {role === "LEARNER" && (
            <Button type="button" onClick={() => navigate(ROUTES.projectAssessment.replace(":projectId", projectId))}>
              Take Assessment
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => navigate(ROUTES.projectResults.replace(":projectId", projectId))}>
            View Results
          </Button>
        </div>
      </section>

      <nav className={styles.tabs} aria-label="Project workspace tabs">
        {tabs.map((tab) => (
          <button className={activeTab === tab ? styles.activeTab : styles.tab} key={tab} onClick={() => setActiveTab(tab)} type="button">
            {tab}
          </button>
        ))}
      </nav>

      {activeTab === "Overview" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Overview</h2>
            <p>{workspace.overview.summary}</p>
          </div>
          <div className={styles.gridTwo}>
            <article className={styles.block}>
              <h3>Architecture Overview</h3>
              <p>{workspace.overview.architectureOverview}</p>
            </article>
            <article className={styles.block}>
              <h3>Technology Stack</h3>
              <div className={styles.tags}>{workspace.overview.technologyStack.map((item) => <span key={item}>{item}</span>)}</div>
            </article>
            <article className={styles.block}>
              <h3>Integrations</h3>
              <div className={styles.tags}>{workspace.overview.integrations.map((item) => <span key={item}>{item}</span>)}</div>
            </article>
            <article className={styles.block}>
              <h3>Repository Statistics</h3>
              <div className={styles.metricGrid}>
                {workspace.overview.repositoryStatistics.map((stat) => (
                  <div className={styles.metric} key={stat.label}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      )}

      {activeTab === "KT Checklist" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>KT Checklist</h2>
            <select value={checklistFilter} onChange={(event) => setChecklistFilter(event.target.value as ChecklistStatus | "All")}>
              {checklistFilters.map((filter) => <option key={filter}>{filter}</option>)}
            </select>
          </div>
          <div className={styles.list}>
            {filteredChecklist.map((item) => (
              <article className={styles.rowCard} key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <div className={styles.progressBox}>
                  <span>{item.status}</span>
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${item.completionPercentage}%` }} />
                  </div>
                  <small>{item.completionPercentage}%</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "SME Recommendations" && (
        <section className={styles.panel}>
          <div className={styles.notice}>SME recommendations are currently generated from mock repository analysis and will be replaced once repository integration is available.</div>
          <div className={styles.list}>
            {workspace.smeRecommendations.map((sme) => (
              <article className={styles.rowCard} key={sme.id}>
                <div>
                  <h3>{sme.name}</h3>
                  <div className={styles.tags}>{sme.expertiseAreas.map((area) => <span key={area}>{area}</span>)}</div>
                </div>
                <div className={styles.scorePair}>
                  <span>Contribution {sme.contributionScore}</span>
                  <span>Confidence {sme.confidenceScore}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "KT Assignments" && role === "ADMIN" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>KT Assignments</h2>
            <Button type="button" onClick={() => setIsAssignmentModalOpen(true)}>Create Assignment</Button>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SME</th>
                  <th>Learner</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspace.assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>{assignment.sme}</td>
                    <td>{assignment.learner}</td>
                    <td>{assignment.dueDate}</td>
                    <td>{assignment.status}</td>
                    <td className={styles.tableActions}>
                      <button type="button" onClick={() => { setEditingAssignment(assignment); setIsAssignmentModalOpen(true); }}>Edit</button>
                      <button type="button" onClick={() => handleCancelAssignment(assignment.id)}>Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "Knowledge Base" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Knowledge Base</h2>
            <input value={knowledgeSearch} onChange={(event) => setKnowledgeSearch(event.target.value)} placeholder="Search documents" type="search" />
          </div>
          {filteredDocuments.length === 0 ? (
            <EmptyState title="No knowledge base content" description="No generated KT documents match this search." />
          ) : (
            <div className={styles.list}>
              {filteredDocuments.map((document) => (
                <article className={styles.doc} key={document.id}>
                  <button type="button" onClick={() => setExpandedDocs((current) => ({ ...current, [document.id]: !current[document.id] }))}>
                    <span>{document.section}: {document.title}</span>
                    <span>{expandedDocs[document.id] ? "Collapse" : "Expand"}</span>
                  </button>
                  {expandedDocs[document.id] && <p>{document.content}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <Modal
        isOpen={isAssignmentModalOpen}
        onClose={() => { setIsAssignmentModalOpen(false); setEditingAssignment(null); }}
        title={editingAssignment ? "Edit Assignment" : "Create Assignment"}
      >
        <form className={styles.form} onSubmit={handleAssignmentSubmit}>
          <label>
            SME
            <input name="sme" required defaultValue={editingAssignment?.sme ?? ""} />
          </label>
          <label>
            Learner
            <input name="learner" required defaultValue={editingAssignment?.learner ?? ""} />
          </label>
          <label>
            Due Date
            <input name="dueDate" required type="date" defaultValue={editingAssignment?.dueDate ?? "2026-06-20"} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={editingAssignment?.status ?? "Assigned"}>
              {assignmentStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>
          <Button type="submit">{editingAssignment ? "Save Assignment" : "Create Assignment"}</Button>
        </form>
      </Modal>
    </div>
  );
}

export default ProjectPage;
