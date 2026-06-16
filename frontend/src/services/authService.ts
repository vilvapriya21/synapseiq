import { User, UserRole } from "../types";
import { useAuthStore } from "../store/authStore";
import apiClient from "./api";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface SignupRequest extends LoginRequest {
  name: string;
  role: UserRole;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
  verification_code?: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  password: string;
  confirm_password: string;
}

export const authService = {
  async login(email: string, password: string, rememberMe = true) {
    const response = await apiClient.post<{ token: string; user: User }>("/auth/login", {
      email,
      password,
    });
    const { token, user } = response.data;
    useAuthStore.getState().login(user, { accessToken: token }, rememberMe);
    return { token, user };
  },

  async signup(name: string, email: string, password: string, role: string) {
    const response = await apiClient.post<{ token: string; user: User }>("/auth/signup", {
      name,
      email,
      password,
      role,
    });
    const { token, user } = response.data;
    useAuthStore.getState().login(user, { accessToken: token });
    return { token, user };
  },

  async me() {
    const response = await apiClient.get<User>("/auth/me");
    return response.data;
  },

  logout() {
    useAuthStore.getState().logout();
  },

  async forgotPassword(payload: ForgotPasswordRequest) {
    const response = await apiClient.post<ForgotPasswordResponse>("/auth/forgot-password", payload);
    return response.data;
  },

  async resetPassword(payload: ResetPasswordRequest) {
    const response = await apiClient.post<{ message: string }>("/auth/reset-password", payload);
    return response.data;
  },
};
