export interface User {
  email: string;
  id: string;
  name: string;
  roles: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}
