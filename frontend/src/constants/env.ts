export const ENV = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1",
  appName: import.meta.env.VITE_APP_NAME || "SynapseIQ",
} as const;
