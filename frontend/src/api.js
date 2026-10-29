// Small fetch wrapper. AUTH-1 (Zakir) can add the session token here so every call is authenticated.
export async function apiGet(path) {
  const response = await fetch(`/api${path}`, { credentials: "include" });
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
