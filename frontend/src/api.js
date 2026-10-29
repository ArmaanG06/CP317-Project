// Small fetch wrapper. credentials: "include" sends AUTH-1's httpOnly session cookie with every call.
export async function apiGet(path) {
  const response = await fetch(`/api${path}`, { credentials: "include" });
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
