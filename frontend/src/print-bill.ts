import { lineTotal, rupees } from "./demo-data";
import type { CartLine, PosOrder } from "./pos-types";
import { DEFAULT_RESTAURANT_NAME, isLogoDataUrl } from "./settings";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function printGuestBill(
  order: PosOrder,
  brand: { restaurantName?: string; logoDataUrl?: string | null } = {},
) {
  const total = lineTotal(order.lines);
  const where =
    order.type === "takeaway" ? "Takeaway" : `Table ${order.tableId ?? ""}`;
  const rows = order.lines
    .map(
      (line: CartLine) => `
      <tr>
        <td>${escapeHtml(line.name)}</td>
        <td class="qty">${line.qty}</td>
        <td class="num">${rupees(line.price * line.qty)}</td>
      </tr>`,
    )
    .join("");
  const name = (brand.restaurantName ?? DEFAULT_RESTAURANT_NAME).trim() || DEFAULT_RESTAURANT_NAME;
  const logo = isLogoDataUrl(brand.logoDataUrl ?? null) ? brand.logoDataUrl : null;

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Bill ${order.token}</title>
    <style>
      @page { size: 80mm auto; margin: 8mm; }
      body {
        font-family: "Figtree", "Segoe UI", sans-serif;
        color: #1a1612;
        margin: 0;
      }
      .chit {
        width: 72mm;
        margin: 0 auto;
      }
      h1 { font-size: 16px; margin: 0; letter-spacing: 0.02em; }
      .brand { text-align: center; border-bottom: 2px dashed #1a1612; padding-bottom: 10px; }
      .logo { display: block; max-width: 42mm; max-height: 28mm; margin: 0 auto 8px; object-fit: contain; }
      .meta { margin: 10px 0; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { text-align: left; border-bottom: 1px solid #1a1612; padding: 4px 0; }
      td { padding: 6px 0; border-bottom: 1px dotted #cbbfb3; }
      .qty, .num, th:last-child { text-align: right; }
      .total { font-size: 18px; font-weight: 800; display: flex; justify-content: space-between; margin-top: 10px; }
      .thanks { text-align: center; margin-top: 16px; font-size: 12px; }
    </style>
  </head>
  <body>
    <article class="chit">
      <div class="brand">
        ${logo ? `<img class="logo" src="${logo}" alt="" />` : ""}
        <h1>${escapeHtml(name)}</h1>
        <div>Guest bill</div>
      </div>
      <div class="meta">
        <div>Token ${order.token}</div>
        <div>${escapeHtml(where)}</div>
        <div>${escapeHtml(order.time)}</div>
      </div>
      <table>
        <thead><tr><th>Item</th><th></th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total"><span>Total</span><span>${rupees(total)}</span></div>
      <p class="thanks">شکریہ · Pay at the counter</p>
    </article>
  </body>
</html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const finish = () => {
    window.setTimeout(() => frame.remove(), 400);
  };

  try {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } finally {
    finish();
  }
}
