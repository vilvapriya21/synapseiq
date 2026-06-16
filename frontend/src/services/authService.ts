import { apiClient } from "./api";
import { User, UserRole } from "../types";

export interface LoginRequest {
  email: string;
  password: string;
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

export interface LoginResponse {
  token: string;
  user: User;
}

export const authService = {
  login: async (payload: LoginRequest) => {
    const response = await apiClient.post<LoginResponse>("/auth/login", payload);
    return response.data;
  },

  signup: async (payload: SignupRequest) => {
    const response = await apiClient.post<LoginResponse>("/auth/signup", {
      ...payload,
      role: payload.role.toLowerCase(),
    });
    return response.data;
  },

  forgotPassword: async (payload: ForgotPasswordRequest) => {
    const response = await apiClient.post<ForgotPasswordResponse>("/auth/forgot-password", payload);
    return response.data;
  },

  resetPassword: async (payload: ResetPasswordRequest) => {
    const response = await apiClient.post<{ message: string }>("/auth/reset-password", payload);
    return response.data;
  },

  me: async () => {
    const response = await apiClient.get<User>("/auth/me");
    return response.data;
  },
};
