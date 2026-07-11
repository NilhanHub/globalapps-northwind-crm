export type StructuredError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
};

export * from './contracts.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId = '',
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export function createApiClient(
  options: {
    fetcher?: typeof fetch;
    getCsrfToken?: () => string;
    onUnauthorized?: (code: string) => void;
  } = {},
) {
  const fetcher = options.fetcher ?? fetch;

  return {
    async request<T = unknown>(path: string, init: RequestOptions = {}): Promise<T> {
      const { body, ...requestOptions } = init;
      const method = (init.method ?? 'GET').toUpperCase();
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const csrf = options.getCsrfToken?.();
        if (csrf) headers['X-CSRF-Token'] = csrf;
      }
      const requestInit: RequestInit = {
        ...requestOptions,
        method,
        headers,
        credentials: 'same-origin',
      };
      if (body !== undefined) requestInit.body = JSON.stringify(body);
      const response = await fetcher(path, requestInit);
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as T | { error?: StructuredError }) : undefined;
      if (!response.ok) {
        const error = (payload as { error?: StructuredError } | undefined)?.error;
        if (response.status === 401) options.onUnauthorized?.(error?.code ?? 'SESSION_INVALID');
        throw new ApiError(
          response.status,
          error?.code ?? 'REQUEST_FAILED',
          error?.message ?? `Request failed (${response.status})`,
          error?.requestId,
          error?.fieldErrors,
        );
      }
      return payload as T;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
