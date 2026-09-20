export const DEFAULT_MENU_CATEGORIES = [
  'Karahi',
  'Naan & Roti',
  'BBQ',
  'Rice',
  'Drinks',
  'Sides',
];

export type CategoryChange =
  | { ok: true; list: string[]; from?: string; to?: string }
  | { ok: false; error: string };

export function normalizeCategoryName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return name || null;
}

export function mergeMenuCategories(
  saved: unknown,
  menuCategories: string[] = [],
): string[] {
  const fromSaved = Array.isArray(saved)
    ? uniqueNames(saved.map(normalizeCategoryName))
    : [];
  const fromMenu = uniqueNames(menuCategories.map(normalizeCategoryName));
  const merged = uniqueNames([...fromSaved, ...fromMenu]);
  if (merged.length > 0) {
    if (fromSaved.length > 0) return merged;
    return uniqueNames([
      ...merged,
      ...DEFAULT_MENU_CATEGORIES.filter((name) => !hasName(merged, name)),
    ]);
  }
  return [...DEFAULT_MENU_CATEGORIES];
}

export function addMenuCategory(
  list: string[],
  name: unknown,
): CategoryChange {
  const next = normalizeCategoryName(name);
  if (!next) return { ok: false, error: 'Enter a category name.' };
  if (hasName(list, next)) {
    return { ok: false, error: 'That category is already on the menu.' };
  }
  return { ok: true, list: [...list, next] };
}

export function renameMenuCategory(
  list: string[],
  from: string,
  to: unknown,
): CategoryChange {
  const current = normalizeCategoryName(from);
  const next = normalizeCategoryName(to);
  if (!current || !list.includes(current)) {
    return { ok: false, error: 'Category not found.' };
  }
  if (!next) return { ok: false, error: 'Enter a category name.' };
  if (hasName(list, next) && current.toLowerCase() !== next.toLowerCase()) {
    return { ok: false, error: 'That category is already on the menu.' };
  }
  return {
    ok: true,
    list: list.map((name) => (name === current ? next : name)),
    from: current,
    to: next,
  };
}

export function removeMenuCategory(
  list: string[],
  name: unknown,
): CategoryChange {
  const current = normalizeCategoryName(name);
  if (!current || !list.includes(current)) {
    return { ok: false, error: 'Category not found.' };
  }
  if (list.length < 2) {
    return { ok: false, error: 'Keep at least one category.' };
  }
  return { ok: true, list: list.filter((entry) => entry !== current) };
}

export function remapItemCategory(
  category: string,
  from: string,
  to: string,
): string {
  return category === from ? to : category;
}

function uniqueNames(names: Array<string | null>): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const name of names) {
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(name);
  }
  return list;
}

function hasName(list: string[], name: string) {
  const key = name.toLowerCase();
  return list.some((entry) => entry.toLowerCase() === key);
}
