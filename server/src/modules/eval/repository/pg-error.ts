/** Postgres SQLSTATE of an error; drizzle may wrap the driver error in `cause`. */
export function pgCode(err: unknown): string | undefined {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  const own = code(err);
  if (typeof own === 'string') return own;
  const wrapped = code((err as { cause?: unknown } | null)?.cause);
  return typeof wrapped === 'string' ? wrapped : undefined;
}

export const UNIQUE_VIOLATION = '23505';
export const FOREIGN_KEY_VIOLATION = '23503';
