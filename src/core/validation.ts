import { AppError } from './errors.js';
export function record(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('VALIDATION_ERROR','请求数据必须是对象。');
  return value as Record<string,unknown>;
}
export function title(value: unknown, field = 'title', max=160): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length>max) throw new AppError('VALIDATION_ERROR',field+' 不合法。');
  return value.trim();
}
export function textOrNull(value: unknown, max=4000): string|null {
  if (value==null || value==='') return null;
  if (typeof value!=='string' || value.length>max) throw new AppError('VALIDATION_ERROR','文本字段不合法。');
  return value.trim()||null;
}
export function optionalId(value:unknown):string|null {
  if (value==null || value==='') return null;
  if (typeof value!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AppError('VALIDATION_ERROR','关联对象 ID 不合法。');
  return value;
}
export function requiredId(value:unknown):string {
  const id=optionalId(value); if (!id) throw new AppError('VALIDATION_ERROR','缺少 ID。'); return id;
}
