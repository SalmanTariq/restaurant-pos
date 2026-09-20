import { lineTotal, rupees } from "./demo-data";
import type { CartLine, PosOrder } from "./pos-types";
import { DEFAULT_RESTAURANT_NAME, isLogoDataUrl } from "./settings";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function orderWhere(order: PosOrder) {
  return order.type === "takeaway" ? "Takeaway" : `Table ${order.tableId ?? ""}`;
}

function brandName(brand: { restaurantName?: string }) {
  return (brand.restaurantName ?? DEFAULT_RESTAURANT_NAME).trim() || DEFAULT_RESTAURANT_NAME;
}

function waitForImages(doc: Document) {
  return Promise.all(
    Array.from(doc.images).map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
}

function slipHeightMm(doc: Document) {
  const slip = (doc.querySelector(".slip") ?? doc.querySelector(".chit")) as HTMLElement | null;
  const px = slip
    ? Math.ceil(Math.max(slip.scrollHeight, slip.offsetHeight))
    : Math.ceil(doc.body.scrollHeight);
  return Math.min(600, Math.max(24, Math.ceil((px * 25.4) / 96) + 2));
}

function applyReceiptPage(
  doc: Document,
  iframe: HTMLIFrameElement,
  heightMm: number,
) {
  let style = doc.getElementById("receipt-page");
  if (!style) {
    style = doc.createElement("style");
    style.id = "receipt-page";
    doc.head.appendChild(style);
  }
  style.textContent = `
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 80mm !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: hidden !important;
      background: #fff;
    }
    @page {
      size: 80mm ${heightMm}mm;
      margin: 0;
    }
    @media print {
      html, body {
        width: 80mm !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }
    }
  `;
  iframe.style.width = "80mm";
  iframe.style.height = `${heightMm}mm`;
}

function sharedCss() {
  return `
    html, body { margin: 0; padding: 0; width: 80mm; height: auto; min-height: 0; }
    body {
      font-family: "Figtree", "Segoe UI", sans-serif;
      color: #1a1612;
    }
    .slip { width: 80mm; margin: 0; padding: 0; box-sizing: border-box; }
    .chit { width: 72mm; margin: 0; padding: 2mm 4mm 3mm; box-sizing: border-box; page-break-after: avoid; page-break-inside: avoid; }
  `;
}

function kitchenChitHtml(
  order: PosOrder,
  brand: { restaurantName?: string } = {},
) {
  const name = brandName(brand);
  const where = orderWhere(order);
  const count = order.lines.reduce((sum, line) => sum + line.qty, 0);
  const rows = order.lines
    .map(
      (line: CartLine) => `
      <tr>
        <td class="qty">${line.qty}×</td>
        <td>${escapeHtml(line.name)}</td>
      </tr>`,
    )
    .join("");

  return `
    <article class="chit kitchen-chit">
      <div class="kicker">${escapeHtml(name)}</div>
      <h1 class="kitchen">Kitchen · کچن</h1>
      <div class="token">${order.token}</div>
      <div class="meta">
        <div>${escapeHtml(where)}</div>
        <div>${escapeHtml(order.date)} · ${escapeHtml(order.time)}</div>
      </div>
      <table>
        <tbody>${rows || `<tr><td colspan="2">No items</td></tr>`}</tbody>
      </table>
      <p class="foot">${count} ${count === 1 ? "item" : "items"} · Token ${order.token}</p>
    </article>`;
}

function guestChitHtml(
  order: PosOrder,
  brand: { restaurantName?: string; logoDataUrl?: string | null } = {},
) {
  const total = lineTotal(order.lines);
  const where = orderWhere(order);
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
  const paidNote =
    order.status === "paid"
      ? `Paid · ${order.payment === "online" ? "Online" : "Cash"}`
      : "Pay at the counter";
  const name = brandName(brand);
  const logo = isLogoDataUrl(brand.logoDataUrl ?? null) ? brand.logoDataUrl : null;

  return `
    <article class="chit guest-chit">
      <div class="brand">
        ${logo ? `<img class="logo" src="${logo}" alt="${escapeHtml(name)}" />` : ""}
        <h1>${escapeHtml(name)}</h1>
        <div>Guest bill</div>
      </div>
      <div class="meta">
        <div>Token ${order.token}</div>
        <div>${escapeHtml(where)}</div>
        <div>${escapeHtml(order.date)} · ${escapeHtml(order.time)}</div>
      </div>
      <table>
        <thead><tr><th>Item</th><th></th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total"><span>Total</span><span>${rupees(total)}</span></div>
      <p class="thanks">شکریہ · ${escapeHtml(paidNote)}</p>
    </article>`;
}

function kitchenCss() {
  return `
    .kicker {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .kitchen {
      text-align: center;
      font-size: 22px;
      font-weight: 800;
      margin: 4px 0 0;
      letter-spacing: 0.04em;
    }
    .token {
      text-align: center;
      font-size: 56px;
      font-weight: 900;
      line-height: 1;
      margin: 8px 0 4px;
    }
    .kitchen-chit .meta { text-align: center; font-size: 14px; margin-bottom: 10px; }
    .kitchen-chit table { width: 100%; border-collapse: collapse; font-size: 16px; }
    .kitchen-chit td { padding: 8px 0; border-bottom: 1px dashed #1a1612; vertical-align: top; }
    .kitchen-chit .qty { width: 18mm; font-weight: 900; font-size: 20px; }
    .foot { text-align: center; margin: 8px 0 0; font-size: 12px; font-weight: 700; }
  `;
}

function guestCss() {
  return `
    .guest-chit h1 { font-size: 16px; margin: 0; letter-spacing: 0.02em; }
    .brand { text-align: center; border-bottom: 2px dashed #1a1612; padding-bottom: 10px; }
    .logo {
      display: block;
      width: 100%;
      max-width: 56mm;
      max-height: 36mm;
      margin: 0 auto 10px;
      object-fit: contain;
    }
    .guest-chit .meta { margin: 10px 0; font-size: 13px; }
    .guest-chit table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .guest-chit th { text-align: left; border-bottom: 1px solid #1a1612; padding: 4px 0; }
    .guest-chit td { padding: 6px 0; border-bottom: 1px dotted #cbbfb3; }
    .guest-chit .qty, .guest-chit .num, .guest-chit th:last-child { text-align: right; }
    .total { font-size: 18px; font-weight: 800; display: flex; justify-content: space-between; margin-top: 10px; }
    .thanks { text-align: center; margin: 12px 0 0; font-size: 12px; }
  `;
}

function receiptDocument(title: string, css: string, inner: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${sharedCss()}
      ${css}
    </style>
  </head>
  <body>
    <div class="slip">${inner}</div>
  </body>
</html>`;
}

function afterLayout(win: Window) {
  return new Promise<void>((resolve) => {
    win.requestAnimationFrame(() => {
      win.requestAnimationFrame(() => resolve());
    });
  });
}

function printHtml(title: string, html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", title);
  frame.style.position = "fixed";
  frame.style.left = "0";
  frame.style.top = "0";
  frame.style.width = "80mm";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.overflow = "hidden";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return Promise.resolve();
  }
  doc.open();
  doc.write(html);
  doc.close();

  return waitForImages(doc)
    .then(() => afterLayout(win))
    .then(() => {
      applyReceiptPage(doc, frame, slipHeightMm(doc));
      return afterLayout(win);
    })
    .then(
      () =>
        new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            win.removeEventListener("afterprint", done);
            window.setTimeout(() => frame.remove(), 400);
            resolve();
          };
          win.addEventListener("afterprint", done);
          win.focus();
          win.print();
          window.setTimeout(done, 120_000);
        }),
    );
}

export function printKitchenToken(
  order: PosOrder,
  brand: { restaurantName?: string } = {},
) {
  return printHtml(
    `Kitchen ${order.token}`,
    receiptDocument(
      `Kitchen ${order.token}`,
      kitchenCss(),
      kitchenChitHtml(order, brand),
    ),
  );
}

export function printGuestBill(
  order: PosOrder,
  brand: { restaurantName?: string; logoDataUrl?: string | null } = {},
) {
  return printHtml(
    `Bill ${order.token}`,
    receiptDocument(
      `Bill ${order.token}`,
      `${guestCss()}`,
      guestChitHtml(order, brand),
    ),
  );
}
