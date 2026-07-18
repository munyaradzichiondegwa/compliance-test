const API_BASE = '/api/v1';

let accessToken: string | null = localStorage.getItem('zacc_access_token');
let refreshToken: string | null = localStorage.getItem('zacc_refresh_token');

export function setTokens(access: string | null, refresh?: string | null) {
  accessToken = access;
  if (access) localStorage.setItem('zacc_access_token', access);
  else localStorage.removeItem('zacc_access_token');
  if (refresh !== undefined) {
    refreshToken = refresh;
    if (refresh) localStorage.setItem('zacc_refresh_token', refresh);
    else localStorage.removeItem('zacc_refresh_token');
  }
}

export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        setTokens(data.accessToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RequestOptions {
  method?: string;
  body?: any;
  isForm?: boolean;
  responseType?: 'json' | 'blob';
  skipAuth?: boolean;
}

async function request<T = any>(path: string, opts: RequestOptions = {}, isRetry = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (!opts.isForm) headers['Content-Type'] = 'application/json';
  if (accessToken && !opts.skipAuth) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? (opts.isForm ? opts.body : JSON.stringify(opts.body)) : undefined,
  });

  if (res.status === 401 && !isRetry && !opts.skipAuth && refreshToken) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, opts, true);
  }

  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    throw new ApiError(res.status, body?.error || `Request failed (${res.status})`, body);
  }

  if (opts.responseType === 'blob') return (await res.blob()) as unknown as T;
  if (res.status === 204) return undefined as unknown as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return undefined as unknown as T;
}

export const api = {
  get: <T = any>(path: string, opts: Partial<RequestOptions> = {}) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T = any>(path: string, body?: any, opts: Partial<RequestOptions> = {}) => request<T>(path, { ...opts, method: 'POST', body }),
  put: <T = any>(path: string, body?: any, opts: Partial<RequestOptions> = {}) => request<T>(path, { ...opts, method: 'PUT', body }),
  del: <T = any>(path: string, opts: Partial<RequestOptions> = {}) => request<T>(path, { ...opts, method: 'DELETE' }),
  blob: (path: string) => request<Blob>(path, { responseType: 'blob' }),
  upload: <T = any>(path: string, formData: FormData) => request<T>(path, { method: 'POST', body: formData, isForm: true }),
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
