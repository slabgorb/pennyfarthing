import { expect, test, vi, afterEach } from 'vitest'
import { getJSON } from './rest'

afterEach(() => vi.restoreAllMocks())

test('getJSON returns parsed body on 200', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
  ))
  await expect(getJSON('/api/workflow/')).resolves.toEqual({ ok: 1 })
})

test('getJSON throws with status on failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })))
  await expect(getJSON('/api/workflow/')).rejects.toThrow('500')
})
