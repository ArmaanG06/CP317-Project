const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(message, status, fieldErrors = []) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors; // [{ field, message }] from the backend's 422 responses
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include", // sends and receives the session cookie
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can’t reach the server. Check your connection and try again.", 0);
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // A 401 anywhere except login/me means the session expired mid-use.
    if (res.status === 401 && path !== "/auth/login" && path !== "/auth/me") {
      window.dispatchEvent(new Event("auth:expired"));
    }
    const fieldErrors = Array.isArray(data?.errors) ? data.errors : [];
    const message =
      typeof data?.detail === "string"
        ? data.detail
        : fieldErrors[0]?.message ?? "Something went wrong. Please try again.";
    throw new ApiError(message, res.status, fieldErrors);
  }
  return data;
}
