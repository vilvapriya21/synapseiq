import { FormEvent, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog, EmptyState, Loader } from "./common";
import {
  addChecklistItem,
  completeChecklistItem,
  deleteChecklistItem,
  getChecklist,
  regenerateChecklist,
  uncompleteChecklistItem,
  updateChecklistItem,
  type ChecklistItem,
} from "../services/repositoryService";
import { useAuthStore } from "../store/authStore";
import { normalizeRole } from "../utils/roles";
import styles from "./KTChecklist.module.css";

interface KTChecklistProps {
  repoId: string;
  topicId: string;
  isAdmin?: boolean;
}

function KTChecklist({ repoId, topicId, isAdmin }: KTChecklistProps) {
  const user = useAuthStore((state) => state.user);
  const role = normalizeRole(user?.role ?? "");
  const adminView = isAdmin ?? role === "ADMIN";
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const completedCount = useMemo(() => items.filter((item) => item.completed).length, [items]);
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  const loadChecklist = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getChecklist(repoId, topicId);
      setItems(response.items);
    } catch {
      setError("Unable to load checklist.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChecklist();
  }, [repoId, topicId]);

  const handleAddItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newTitle.trim()) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const item = await addChecklistItem(repoId, topicId, {
        title: newTitle.trim(),
        description: newDescription.trim() || null,
      });
      setItems((current) => [...current, item]);
      setNewTitle("");
      setNewDescription("");
    } catch {
      setError("Unable to add checklist item.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
  };

  const saveEdit = async (itemId: string) => {
    if (!editTitle.trim()) {
      return;
    }

    setSaving(true);
    setError("");
    try {
      const updated = await updateChecklistItem(repoId, topicId, itemId, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
      });
      setItems((current) =>
        current
          .map((item) => (item.id === itemId ? updated : item))
          .sort((a, b) => a.order - b.order || a.created_at.localeCompare(b.created_at)),
      );
      cancelEdit();
    } catch {
      setError("Unable to update checklist item.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    setPendingDeleteId(null);
    setSaving(true);
    setError("");
    try {
      await deleteChecklistItem(repoId, topicId, itemId);
      setItems((current) => current.filter((item) => item.id !== itemId));
    } catch {
      setError("Unable to delete checklist item.");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setConfirmRegenerate(false);
    setRegenerating(true);
    setRegenerateError("");
    try {
      const response = await regenerateChecklist(repoId, topicId);
      setItems(response.items);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setRegenerateError(detail || "Checklist generation failed. Please try again.");
    } finally {
      setRegenerating(false);
    }
  };

  const toggleComplete = async (item: ChecklistItem) => {
    setError("");
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              completed: !candidate.completed,
              completed_at: candidate.completed ? null : new Date().toISOString(),
            }
          : candidate,
      ),
    );

    try {
      if (item.completed) {
        await uncompleteChecklistItem(repoId, topicId, item.id);
      } else {
        const updated = await completeChecklistItem(repoId, topicId, item.id);
        setItems((current) => current.map((candidate) => (candidate.id === item.id ? updated : candidate)));
      }
    } catch {
      setError("Unable to update checklist progress.");
      await loadChecklist();
    }
  };

  if (loading) {
    return <Loader label="Loading checklist..." />;
  }

  return (
    <div className={styles.checklist}>
      <div className={styles.toolbar}>
        {!adminView ? (
          <div className={styles.progressGroup}>
            <span>{completedCount} / {items.length} complete</span>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : null}
        {adminView ? (
          <button className={styles.secondaryButton} type="button" onClick={() => setConfirmRegenerate(true)} disabled={regenerating}>
            {regenerating ? "Generating..." : "Generate Checklist"}
          </button>
        ) : null}
      </div>

      {regenerateError ? <p className={styles.error}>{regenerateError}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      {adminView ? (
        <form className={styles.addForm} onSubmit={handleAddItem}>
          <input
            className={styles.input}
            placeholder="Checklist item title"
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
          />
          <input
            className={styles.input}
            placeholder="Description"
            value={newDescription}
            onChange={(event) => setNewDescription(event.target.value)}
          />
          <button className={styles.primaryButton} type="submit" disabled={saving || !newTitle.trim()}>
            + Add item
          </button>
        </form>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="No checklist items yet"
          description="Click Regenerate to generate a checklist for this topic."
        />
      ) : (
        <div className={styles.itemList}>
          {items.map((item) => (
            <div
              key={item.id}
              className={`${styles.item} ${adminView ? styles.adminItem : ""}`}
            >
              {adminView ? null : (
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => toggleComplete(item)}
                  aria-label={`Mark ${item.title} complete`}
                />
              )}

              {editingId === item.id ? (
                <div className={styles.editForm}>
                  <input
                    className={styles.input}
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                  />
                  <input
                    className={styles.input}
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />
                  <button className={styles.primaryButton} type="button" onClick={() => saveEdit(item.id)} disabled={saving}>
                    Save
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.itemBody}>
                    <strong className={item.completed ? styles.completedTitle : ""}>{item.title}</strong>
                    {item.description ? <p>{item.description}</p> : null}
                    {item.source ? <span className={styles.sourceTag}>{item.source}</span> : null}
                  </div>
                  {adminView ? (
                    <div className={styles.actions}>
                      <button className={styles.linkButton} type="button" onClick={() => startEdit(item)}>
                        Edit
                      </button>
                      <button
                        aria-label={`Delete ${item.title}`}
                        className={styles.deleteButton}
                        title="Delete checklist item"
                        type="button"
                        onClick={() => setPendingDeleteId(item.id)}
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        confirmLabel="Delete"
        isOpen={pendingDeleteId !== null}
        message="Delete this checklist item? This action cannot be undone."
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => pendingDeleteId && handleDelete(pendingDeleteId)}
        title="Delete checklist item"
      />
      <ConfirmDialog
        confirmLabel="Regenerate"
        isOpen={confirmRegenerate}
        message="Regenerate this checklist? Current items and learner progress will be replaced."
        onCancel={() => setConfirmRegenerate(false)}
        onConfirm={handleRegenerate}
        title="Regenerate checklist"
        variant="primary"
      />
    </div>
  );
}

export default KTChecklist;
