export async function apiRequest(url, accessToken, options = {}) {
  if (!url) {
    throw new Error("This feature needs its API URL configured.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }

  return result;
}
