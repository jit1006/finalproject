// Standard error shape: { code, message, fieldErrors, correlationId }.
export class AppError extends Error {
  constructor(code, message, status = 400, fieldErrors = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export const notFound = (m = "Resource not found") => new AppError("NOT_FOUND", m, 404);
export const forbidden = (m = "You do not have access to this resource") => new AppError("FORBIDDEN", m, 403);
export const unauthorized = (m = "Authentication required") => new AppError("UNAUTHORIZED", m, 401);
export const conflict = (m) => new AppError("CONFLICT", m, 409);
export const unprocessable = (m, fieldErrors = {}) => new AppError("UNPROCESSABLE", m, 422, fieldErrors);
