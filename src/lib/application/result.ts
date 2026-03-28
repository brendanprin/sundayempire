export type ApplicationError = {
  code: string;
  message: string;
  status: number;
  context?: Record<string, unknown>;
};

export type ApplicationSuccess<T> = {
  ok: true;
  data: T;
};

export type ApplicationFailure = {
  ok: false;
  error: ApplicationError;
};

export type ApplicationResult<T> = ApplicationSuccess<T> | ApplicationFailure;

export function okResult<T>(data: T): ApplicationSuccess<T> {
  return {
    ok: true,
    data,
  };
}

export function errorResult(
  code: string,
  message: string,
  status = 400,
  context?: Record<string, unknown>,
): ApplicationFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      status,
      context,
    },
  };
}
