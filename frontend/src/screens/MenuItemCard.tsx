import { rupees, stockTone } from "../demo-data";
import type { MenuItem } from "../pos-types";

export function MenuItemCard({
  item,
  soldOut,
  stockLeft,
  stockText,
  prominent = false,
  onAdd,
}: {
  item: MenuItem;
  soldOut: boolean;
  stockLeft?: number;
  stockText?: string | null;
  prominent?: boolean;
  onAdd: () => void;
}) {
  const label = soldOut
    ? `${item.name}, sold out`
    : `${item.name}, ${rupees(item.price)}`;

  return (
    <button
      type="button"
      className={[
        "item-card",
        "has-photo",
        prominent ? "is-photo-lg" : "",
        soldOut ? "is-out" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={soldOut}
      onClick={onAdd}
      aria-label={label}
    >
      <span className="item-photo" aria-hidden="true">
        {item.imageDataUrl ? (
          <img src={item.imageDataUrl} alt="" />
        ) : (
          <span className="item-photo-fallback">{item.name.slice(0, 1)}</span>
        )}
      </span>
      <span className="item-copy">
        <span className="item-name">{item.name}</span>
        <span className="item-meta">
          <strong>{rupees(item.price)}</strong>
          {stockText ? (
            <em
              className={[
                "stock-count",
                stockLeft !== undefined ? stockTone(stockLeft) : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {stockText}
            </em>
          ) : null}
        </span>
      </span>
    </button>
  );
}
