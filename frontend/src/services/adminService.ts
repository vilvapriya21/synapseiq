import apiClient from "./api";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "learner" | "admin";
  created_at: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: "learner" | "admin";
}

export const getUsers = async (): Promise<AdminUser[]> => {
  const { data } = await apiClient.get<AdminUser[]>("/admin/users");
  return data;
};

export const createUser = async (payload: CreateUserData): Promise<AdminUser> => {
  const { data } = await apiClient.post<AdminUser>("/admin/users", payload);
  return data;
};

export const updateUserRole = async (id: string, role: "learner" | "admin"): Promise<AdminUser> => {
  const { data } = await apiClient.patch<AdminUser>(`/admin/users/${id}/role`, { role });
  return data;
};

export const deleteUser = async (id: string): Promise<void> => {
  await apiClient.delete(`/admin/users/${id}`);
};
