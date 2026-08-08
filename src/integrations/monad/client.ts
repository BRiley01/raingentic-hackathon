// Monad API client — auth + request wrapper.
// TODO: confirm what Monad provides (payments? search? settlement?) and map accordingly.

const BASE_URL = process.env.MONAD_BASE_URL ?? "";
const API_KEY = process.env.MONAD_API_KEY ?? "";

export async function monadRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Monad request failed: ${res.status}`);
  return res.json() as Promise<T>;
}
