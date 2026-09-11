import { usePos } from "../pos-store";
import { brandShort } from "../settings";

export function BrandLockup() {
  const { settings } = usePos();
  return (
    <div className="brand">
      {settings.logoDataUrl ? (
        <img className="brand-logo" src={settings.logoDataUrl} alt="" />
      ) : (
        <span className="brand-mark" aria-hidden="true" />
      )}
      <span className="brand-full">{settings.restaurantName}</span>
      <span className="brand-short">{brandShort(settings.restaurantName)}</span>
    </div>
  );
}
