import { NextResponse } from 'next/server';

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function apiSuccess<T>(data: T, init?: ResponseInit, meta?: Record<string, unknown>) {
  return NextResponse.json<ApiSuccess<T>>(
    {
      success: true,
      data,
      ...(meta ? { meta } : {}),
    },
    init,
  );
}

/**
 * @deprecated Use `apiFailure` (standardized `success:false` contract).
 */
export function apiError(code: string, message: string, status = 400, details?: unknown, init?: ResponseInit) {
  return NextResponse.json<ApiFailure>(
    {
      success: false,
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

export function apiFailure(code: string, message: string, status = 400, details?: unknown, init?: ResponseInit) {
  return apiError(code, message, status, details, init);
}
