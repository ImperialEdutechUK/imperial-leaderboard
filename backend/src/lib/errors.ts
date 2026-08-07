export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', msg, details);

export const unauthorized = (msg = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', msg);

export const forbidden = (msg = 'You do not have access to this resource') =>
  new AppError(403, 'FORBIDDEN', msg);

export const notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);

export const conflict = (msg: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', msg, details);

export const unprocessable = (msg: string, details?: unknown) =>
  new AppError(422, 'UNPROCESSABLE', msg, details);
