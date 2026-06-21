import { apiClient } from "./api";
import { User } from "../types";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest extends LoginRequest {
  first_name: string;
  last_name?: string;
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
  login: async (payloadOrEmail: LoginRequest | string, password?: string, remember?: boolean) => {
    const payload: LoginRequest =
      typeof payloadOrEmail === "string" ? { email: payloadOrEmail, password: password || "" } : payloadOrEmail;
    const response = await apiClient.post<LoginResponse>("/auth/login", payload);
    return response.data;
  },

  signup: async (payload: SignupRequest) => {
    const response = await apiClient.post<{ message: string }>("/auth/signup", payload);
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
