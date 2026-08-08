export async function getJSON<T>(path: string): Promise<T> {
  const resp = await fetch(path)
  if (!resp.ok) throw new Error(`GET ${path} failed: ${resp.status}`)
  return (await resp.json()) as T
}

export async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`PATCH ${path} failed: ${resp.status}`)
  return (await resp.json()) as T
}
