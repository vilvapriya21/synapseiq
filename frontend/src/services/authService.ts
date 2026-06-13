import apiClient from "./api";
import { User } from "../types";

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
  role: string;
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
  login: async (payload: LoginRequest) => {
    const { data } = await apiClient.post<LoginResponse>("/auth/login", payload);
    return data;
  },
  signup: async (payload: SignupRequest) => {
    const { data } = await apiClient.post<LoginResponse>("/auth/signup", payload);
    return data;
  },
  forgotPassword: async (payload: ForgotPasswordRequest) => {
    const { data } = await apiClient.post<ForgotPasswordResponse>("/auth/forgot-password", payload);
    return data;
  },
  resetPassword: async (payload: ResetPasswordRequest) => {
    const { data } = await apiClient.post<{ message: string }>("/auth/reset-password", payload);
    return data;
  },
  me: async () => {
    const { data } = await apiClient.get<User>("/auth/me");
    return data;
  },
};
