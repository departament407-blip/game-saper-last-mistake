export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

export function hasApiBackend(): boolean {
  return getApiBaseUrl().length > 0;
}

export async function apiJson<ResponseBody>(
  path: string,
  init: RequestInit = {}
): Promise<ResponseBody> {
  const baseUrl = getApiBaseUrl();

  if (!baseUrl) {
    throw new Error("API backend is not configured.");
  }

  const response = await fetch(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<ResponseBody>;
}
