export function resolveBaseUrl() {
  const fromEnv = process.env.INTERNAL_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    const normalized = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`;
    return normalized.replace(/\/$/, '');
  }
  return 'http://localhost:3000';
}

export async function callInternalJson(path: string, init?: RequestInit) {
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

  return parseJsonResponse(response, `Falha ao chamar ${path}`);
}

function buildInternalUrl(path: string) {
  const baseUrl = resolveBaseUrl();
  if (path.startsWith('http')) return path;
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseJsonResponse(res: Response, fallbackMessage: string) {
  const text = await res.text();
  let json: any = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      console.warn('[internalApi] Resposta não-JSON', fallbackMessage, error);
    }
  }

  if (!res.ok) {
    const message = json?.error || json?.message || fallbackMessage;
    const err = new Error(message);
    (err as any).response = json ?? text;
    (err as any).status = res.status;
    throw err;
  }

  return json;
}
