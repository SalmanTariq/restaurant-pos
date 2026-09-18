import { brandShort } from "../settings";
import { useOptionalPos } from "../pos-store";

export function BrandLockup({
  name = "Restaurant POS",
  logoDataUrl = null,
}: {
  name?: string;
  logoDataUrl?: string | null;
}) {
  const pos = useOptionalPos();
  const restaurantName = pos?.settings.restaurantName ?? name;
  const logo = pos?.settings.logoDataUrl ?? logoDataUrl;

  return (
    <div className="brand">
      {logo ? (
        <img className="brand-logo" src={logo} alt="" />
      ) : (
        <span className="brand-mark" aria-hidden="true" />
      )}
      <span className="brand-full">{restaurantName}</span>
      <span className="brand-short">{brandShort(restaurantName)}</span>
    </div>
  );
}
