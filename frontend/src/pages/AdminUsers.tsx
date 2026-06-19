import { FormEvent, useEffect, useState } from "react";
import {
  AdminUser,
  createUser,
  deleteUser,
  getUsers,
  updateUserRole,
} from "../services/adminService";
import { EmptyState } from "../components/common";
import Input from "../components/common/Input";
import Loader from "../components/common/Loader";
import Table, { type TableColumn } from "../components/common/Table";
import styles from "./AdminUsers.module.css";

type CreateFormState = {
  name: string;
  email: string;
  password: string;
  role: "learner" | "admin";
};

const initialCreateForm: CreateFormState = {
  name: "",
  email: "",
  password: "",
  role: "learner",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(initialCreateForm);
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getUsers();
      setUsers(response);
    } catch {
      setError("Unable to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createUser(createForm);
      setCreateForm(initialCreateForm);
      setShowCreateForm(false);
      await fetchUsers();
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setError(axiosError.response?.data?.detail || "Unable to create user.");
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (user: AdminUser) => {
    const nextRole = user.role === "admin" ? "learner" : "admin";
    setSaving(true);
    setError("");
    try {
      await updateUserRole(user.id, nextRole);
      await fetchUsers();
    } catch {
      setError("Unable to update user role.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (user: AdminUser) => {
    if (!window.confirm(`Remove ${user.name}? This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteUser(user.id);
      await fetchUsers();
    } catch {
      setError("Unable to remove user.");
    } finally {
      setSaving(false);
    }
  };

  const columns: TableColumn<AdminUser>[] = [
    {
      key: "name",
      header: "Name",
      render: (user) => <span className={styles.nameCell}>{user.name}</span>,
    },
    { key: "email", header: "Email" },
    {
      key: "role",
      header: "Role",
      render: (user) => (
        <span
          className={`${styles.roleBadge} ${
            user.role === "admin" ? styles.roleBadgeAdmin : styles.roleBadgeLearner
          }`}
        >
          {user.role}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Joined",
      render: (user) => formatDate(user.created_at),
    },
    {
      key: "actions",
      header: "Actions",
      render: (user) => (
        <>
          <button
            className={styles.actionButton}
            type="button"
            onClick={() => handleRoleChange(user)}
            disabled={saving}
          >
            Change Role
          </button>
          <button
            className={styles.removeButton}
            type="button"
            onClick={() => handleRemove(user)}
            disabled={saving}
          >
            Remove
          </button>
        </>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1 className={styles.heading}>User Management</h1>
          <p className={styles.subtitle}>Create accounts and manage access roles</p>
        </div>
        <button className={styles.primaryButton} type="button" onClick={() => setShowCreateForm(true)}>
          Add User
        </button>
      </header>

      {showCreateForm ? (
        <form className={styles.formCard} onSubmit={handleCreate}>
          <Input
            className={styles.input}
            type="text"
            placeholder="Name"
            value={createForm.name}
            onChange={(event) => setCreateForm((form) => ({ ...form, name: event.target.value }))}
          />
          <Input
            className={styles.input}
            type="email"
            placeholder="Email"
            value={createForm.email}
            onChange={(event) => setCreateForm((form) => ({ ...form, email: event.target.value }))}
          />
          <Input
            className={styles.input}
            type="password"
            placeholder="Password"
            value={createForm.password}
            onChange={(event) => setCreateForm((form) => ({ ...form, password: event.target.value }))}
          />
          <select
            className={styles.input}
            value={createForm.role}
            onChange={(event) =>
              setCreateForm((form) => ({ ...form, role: event.target.value as CreateFormState["role"] }))
            }
          >
            <option value="learner">Learner</option>
            <option value="admin">Admin</option>
          </select>
          <div className={styles.formActions}>
            <button className={styles.primaryButton} type="submit" disabled={saving}>
              Create
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => {
                setCreateForm(initialCreateForm);
                setShowCreateForm(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.card}>
        {loading ? (
          <div className={styles.state}><Loader label="Loading users..." /></div>
        ) : (
          <Table
            columns={columns}
            data={users}
            emptyState={<EmptyState title="No users found" description="Create a user to grant access to SynapseIQ." />}
            getRowKey={(user) => user.id}
            tableClassName={styles.table}
            wrapperClassName={styles.tableWrap}
          />
        )}
      </section>
    </div>
  );
}

export default AdminUsersPage;
