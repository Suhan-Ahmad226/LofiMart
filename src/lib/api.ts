function resolveApiBase(): string {
  const configuredBase = (
    process.env.NEXT_PUBLIC_API_BASE_URL || '/api'
  ).trim();

  if (!configuredBase) {
    return '/api';
  }

  if (configuredBase.startsWith('/')) {
    return configuredBase;
  }

  if (typeof window === 'undefined') {
    return configuredBase;
  }

  try {
    const configuredUrl = new URL(
      configuredBase,
      window.location.origin,
    );

    if (
      configuredUrl.origin ===
      window.location.origin
    ) {
      return (
        configuredUrl.pathname.replace(
          /\/+$/,
          '',
        ) || '/api'
      );
    }
  } catch {
    return '/api';
  }

  return '/api';
}

const API_BASE = resolveApiBase();

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout') ||
    url.includes('/auth/supabase/exchange')
  );
}

function dispatchAuthLogout(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new Event('auth:logout'),
  );
}

type ApiResponse<T = unknown> = {
  data: T;
  status: number;
  statusText: string;
};

class ApiError extends Error {
  public status: number;
  public response: { status: number; data: unknown };

  constructor(status: number, statusText: string, data: unknown) {
    super(`Request failed with status ${status}: ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.response = { status, data };
  }
}

async function request<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  };

  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, options);
  } catch {
    if (isAuthEndpoint(url)) {
      throw new Error('Network request failed');
    }
    throw new Error('Failed to reach the server');
  }

  const contentType = response.headers.get('content-type');
  let data: unknown = null;

  if (contentType?.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const status = response.status;

    if (status === 401 && !isAuthEndpoint(url)) {
      dispatchAuthLogout();
    }

    throw new ApiError(status, response.statusText, data);
  }

  return {
    data: data as T,
    status: response.status,
    statusText: response.statusText,
  };
}

const api = {
  get: <T = unknown>(url: string) => request<T>('GET', url),
  post: <T = unknown>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T = unknown>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T = unknown>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  delete: <T = unknown>(url: string) => request<T>('DELETE', url),
};

export default api;
