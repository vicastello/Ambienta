export function resolveBaseUrl() {
  const internal = process.env.INTERNAL_BASE_URL;
  if (internal) return internal.replace(/\/$/, '');
  const port = Number(process.env.PORT);
  if (Number.isFinite(port) && port > 0) {
    return `http://127.0.0.1:${port}`;
  }
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    const normalized = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`;
    return normalized.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}

export async function callInternalJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const target = buildInternalUrl(path);
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  const response = await fetch(target, {
    cache: 'no-store',
    ...init,
    headers,
  });

  return parseJsonResponse<T>(response, `Falha ao chamar ${path}`);
}

function buildInternalUrl(path: string) {
  const baseUrl = resolveBaseUrl();
  if (path.startsWith('http')) return path;
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseJsonResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const text = await res.text();
  let json: unknown = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      console.warn('[internalApi] Resposta não-JSON', fallbackMessage, error);
    }
  }

  if (!res.ok) {
    const errorBody = json as Record<string, unknown> | null;
    const errorText = errorBody && typeof errorBody === 'object'
      ? (() => {
          const rawError = (errorBody as { error?: unknown }).error;
          if (typeof rawError === 'string' && rawError.trim()) return rawError;
          const rawMessage = (errorBody as { message?: unknown }).message;
          if (typeof rawMessage === 'string' && rawMessage.trim()) return rawMessage;
          return null;
        })()
      : null;
    const message = errorText || fallbackMessage;
    type HttpError = Error & { response?: unknown; status?: number };
    const err: HttpError = new Error(message);
    err.response = json ?? text;
    err.status = res.status;
    throw err;
  }

  return json as T;
}
