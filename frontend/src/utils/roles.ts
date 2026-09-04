import { UserRole } from "../types";

export function normalizeRole(role: unknown): UserRole {
  return String(role).toUpperCase() === "ADMIN" ? "ADMIN" : "LEARNER";
}

export function hasAllowedRole(roles: unknown[] | undefined, allowedRoles: UserRole[]) {
  return (roles ?? []).some((role) => allowedRoles.includes(normalizeRole(role)));
}
