export type ConnectionConfig = { kind: 'configured'; url: URL } | { kind: 'unconfigured' | 'invalid' };

export type ProbeResult =
  | { kind: 'reachable' }
  | { kind: 'http'; status: number }
  | { kind: 'not-scm' | 'timeout' | 'cancelled' | 'unreachable' };

const localDevelopment = new Set(['127.0.0.1', 'localhost', '[::1]', '10.0.2.2']);

export function resolveConnection(value: string | undefined, development: boolean): ConnectionConfig {
  if (!value?.trim()) return { kind: 'unconfigured' };
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.search || url.hash || !url.hostname) return { kind: 'invalid' };
    if (url.protocol !== 'https:' && !(development && url.protocol === 'http:' && localDevelopment.has(url.hostname))) {
      return { kind: 'invalid' };
    }
    url.pathname = url.pathname.replace(/\/+$/, '') + '/';
    return { kind: 'configured', url };
  } catch {
    return { kind: 'invalid' };
  }
}

export async function probeScm(url: URL, { signal, timeoutMs = 6500, fetcher = fetch }: {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetcher?: typeof fetch;
} = {}): Promise<ProbeResult> {
  if (signal?.aborted) return { kind: 'cancelled' };
  const controller = new AbortController();
  let finishEarly: (result: ProbeResult) => void = () => {};
  const early = new Promise<ProbeResult>((resolve) => { finishEarly = resolve; });
  const end = (kind: 'cancelled' | 'timeout') => {
    finishEarly({ kind });
    controller.abort();
  };
  const cancel = () => end('cancelled');
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => end('timeout'), timeoutMs);
  const request = async (): Promise<ProbeResult> => {
    try {
      const response = await fetcher(url.href, {
        method: 'GET',
        credentials: 'omit',
        headers: { Accept: 'text/html' },
        signal: controller.signal,
      });
      if (!response.ok) return { kind: 'http', status: response.status };
      const finalUrl = response.url ? new URL(response.url) : null;
      if (!finalUrl || finalUrl.origin !== url.origin || !response.headers.get('content-type')?.startsWith('text/html')) {
        return { kind: 'not-scm' };
      }
      const html = await response.text();
      return { kind: /<title>\s*SCM Login\s*<\/title>/i.test(html) ? 'reachable' : 'not-scm' };
    } catch {
      return { kind: 'unreachable' };
    }
  };
  try {
    return await Promise.race([early, request()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
