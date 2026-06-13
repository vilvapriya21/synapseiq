import { User, UserRole } from "../types";
import { delay, mockUsers } from "./mockData";
import { normalizeRole } from "../utils/roles";

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

const REGISTERED_USERS_KEY = "synapseiq.mockUsers";

interface MockRegisteredUser extends User {
  password: string;
}

const seededCredentials: Record<string, string> = {
  "admin@synapseiq.local": "Admin123",
  "learner@synapseiq.local": "Learner123",
};

function readRegisteredUsers(): MockRegisteredUser[] {
  try {
    const storedUsers = localStorage.getItem(REGISTERED_USERS_KEY);
    if (!storedUsers) {
      return [];
    }

    const users = JSON.parse(storedUsers) as Array<Omit<MockRegisteredUser, "roles"> & { roles?: unknown[] }>;
    return users.map((user) => ({
      ...user,
      password: user.password ?? "",
      roles: [normalizeRole(user.roles?.[0])],
    }));
  } catch {
    return [];
  }
}

function writeRegisteredUser(user: MockRegisteredUser) {
  const users = readRegisteredUsers();
  const nextUsers = [user, ...users.filter((item) => item.email.toLowerCase() !== user.email.toLowerCase())];
  localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(nextUsers));
}

function findMockUser(email: string): MockRegisteredUser | null {
  const normalizedEmail = email.toLowerCase();
  const registeredUser = readRegisteredUsers().find((user) => user.email.toLowerCase() === normalizedEmail);
  if (registeredUser) {
    return registeredUser;
  }

  const seededUser = mockUsers.find((user) => user.email.toLowerCase() === normalizedEmail);
  if (seededUser) {
    return {
      ...seededUser,
      password: seededCredentials[normalizedEmail],
    };
  }

  return null;
}

function toSafeUser(user: MockRegisteredUser): User {
  return {
    email: user.email,
    id: user.id,
    name: user.name,
    roles: user.roles,
  };
}

export const authService = {
  login: async (payload: LoginRequest) => {
    const user = findMockUser(payload.email);
    if (!user) {
      throw new Error("No account found for this email. Please sign up first.");
    }
    if (user.password !== payload.password) {
      throw new Error("Invalid email or password.");
    }

    const role = normalizeRole(user.roles[0]);
    return delay({ token: `mock-token-${role.toLowerCase()}`, user: { ...toSafeUser(user), roles: [role] } });
  },
  signup: async (payload: SignupRequest) => {
    const role = normalizeRole(payload.role);
    const existingUser = findMockUser(payload.email);
    if (existingUser) {
      throw new Error("An account already exists for this email. Please sign in.");
    }

    const user: MockRegisteredUser = {
      id: `${role.toLowerCase()}-${Date.now()}`,
      email: payload.email,
      name: payload.name,
      password: payload.password,
      roles: [role],
    };

    writeRegisteredUser(user);

    return delay({
      token: `mock-token-${role.toLowerCase()}`,
      user: toSafeUser(user),
    });
  },
  forgotPassword: async (payload: ForgotPasswordRequest) => {
    return delay({ message: `Verification code generated for ${payload.email}.`, verification_code: "246810" });
  },
  resetPassword: async (payload: ResetPasswordRequest) => {
    return delay({ message: `Password reset for ${payload.email}.` });
  },
  me: async () => {
    return delay<User>(mockUsers[0]);
  },
};
