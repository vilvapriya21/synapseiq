/**
 * Extracts the `detail` string from an Axios-style API error response.
 * Returns an empty string if the error has no response detail.
 */
export function extractApiErrorDetail(err: unknown): string {
  const e = err as { response?: { data?: { detail?: string | Record<string, string> } } };
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    // Some FastAPI validation errors return an object; stringify the first value.
    return Object.values(detail)[0] ?? "";
  }
  return "";
}
