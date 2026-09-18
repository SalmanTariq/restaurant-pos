const importEsm = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<unknown>;

const CACHE = '__posEsmCache';

type EsmCache = Record<string, Promise<unknown>>;

export function loadEsm<T>(specifier: string): Promise<T> {
  const globalCache = globalThis as unknown as Record<string, EsmCache>;
  if (!globalCache[CACHE]) globalCache[CACHE] = {};
  if (!globalCache[CACHE][specifier]) {
    globalCache[CACHE][specifier] = importEsm(specifier);
  }
  return globalCache[CACHE][specifier] as Promise<T>;
}
