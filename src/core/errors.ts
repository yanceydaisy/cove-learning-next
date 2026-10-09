export type ErrorCode = 'VALIDATION_ERROR'|'NOT_FOUND'|'CONFLICT'|'UNAUTHORIZED'|'INTERNAL_ERROR';
export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public details: Record<string,unknown> = {}) { super(message); }
}
export function errorPayload(error: unknown) {
  if (error instanceof AppError) return { error: {code: error.code,message: error.message,details:error.details} };
  return {error:{code:'INTERNAL_ERROR',message:'操作暂时未完成，请重试。',details:{}}};
}
export function errorStatus(error: unknown): number {
  if (!(error instanceof AppError)) return 500;
  return {VALIDATION_ERROR:400,NOT_FOUND:404,CONFLICT:409,UNAUTHORIZED:401,INTERNAL_ERROR:500}[error.code];
}
