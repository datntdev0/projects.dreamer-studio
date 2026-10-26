const ABSOLUTE_PATH: RegExp = /^([a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\/)/;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && ABSOLUTE_PATH.test(value);
}
