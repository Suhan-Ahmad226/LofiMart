import { NextResponse } from 'next/server';

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function apiSuccess<T>(data: T, init?: ResponseInit, meta?: Record<string, unknown>) {
  return NextResponse.json<ApiSuccess<T>>(
    {
      ok: true,
      data,
      ...(meta ? { meta } : {}),
    },
    init,
  );
}

export function apiError(code: string, message: string, status = 400, details?: unknown, init?: ResponseInit) {
  return NextResponse.json<ApiFailure>(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    {
      status,
      ...init,
    },
  );
}
