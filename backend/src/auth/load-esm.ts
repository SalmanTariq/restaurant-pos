const importEsm = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<unknown>;

export function loadEsm<T>(specifier: string): Promise<T> {
  return importEsm(specifier) as Promise<T>;
}
