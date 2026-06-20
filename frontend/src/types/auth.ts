export type UserRole = "ADMIN" | "LEARNER";

export interface User {
  email: string;
  id: string;
  name: string;
  role?: UserRole | string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
