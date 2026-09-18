export function tenantKey(base: string, restaurantId: string) {
  return `${base}:${restaurantId}`;
}

export function readTenantItem(
  base: string,
  restaurantId: string,
): string | null {
  const scoped = localStorage.getItem(tenantKey(base, restaurantId));
  if (scoped != null) return scoped;
  const legacy = localStorage.getItem(base);
  if (legacy == null) return null;
  localStorage.setItem(tenantKey(base, restaurantId), legacy);
  return legacy;
}

export function writeTenantItem(
  base: string,
  restaurantId: string,
  value: string,
) {
  localStorage.setItem(tenantKey(base, restaurantId), value);
}
