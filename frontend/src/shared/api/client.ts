import { apiErrorFromResponse } from "./errors";

function requestInit(init?: RequestInit): RequestInit {
  return {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  };
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, requestInit(init));
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return response.json() as Promise<T>;
}

export async function requestVoid(url: string, init?: RequestInit): Promise<void> {
  const response = await fetch(url, requestInit(init));
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
}
