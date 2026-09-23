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

function sharedCss() {
  return `
    #pos-print-root {
      width: 80mm;
      margin: 0;
      padding: 0;
      color: #1a1612;
      background: #fff;
      font-family: Arial, "Segoe UI", sans-serif;
      font-size: 12px;
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    #pos-print-root .slip { width: 80mm; margin: 0; padding: 0; box-sizing: border-box; }
    #pos-print-root .chit {
      width: 80mm;
      margin: 0;
      padding: 2mm 4mm 4mm;
      box-sizing: border-box;
      overflow-wrap: anywhere;
    }
    #pos-print-root table { table-layout: fixed; }
    #pos-print-root tr { break-inside: avoid; page-break-inside: avoid; }
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
    #pos-print-root .kicker {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    #pos-print-root .kitchen {
      text-align: center;
      font-size: 22px;
      font-weight: 800;
      margin: 4px 0 0;
      letter-spacing: 0.04em;
    }
    #pos-print-root .token {
      text-align: center;
      font-size: 56px;
      font-weight: 900;
      line-height: 1;
      margin: 8px 0 4px;
    }
    #pos-print-root .kitchen-chit .meta { text-align: center; font-size: 14px; margin-bottom: 10px; }
    #pos-print-root .kitchen-chit table { width: 100%; border-collapse: collapse; font-size: 16px; }
    #pos-print-root .kitchen-chit td { padding: 5px 0; border-bottom: 1px dashed #1a1612; vertical-align: top; }
    #pos-print-root .kitchen-chit .qty { width: 14mm; font-weight: 900; font-size: 20px; }
    #pos-print-root .foot { text-align: center; margin: 8px 0 0; font-size: 12px; font-weight: 700; }
  `;
}

function guestCss() {
  return `
    #pos-print-root .guest-chit h1 { font-size: 16px; margin: 0; letter-spacing: 0.02em; }
    #pos-print-root .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      white-space: normal;
      text-align: center;
      border-bottom: 2px dashed #1a1612;
      padding-bottom: 10px;
    }
    #pos-print-root .logo {
      display: block;
      width: 100%;
      max-width: 56mm;
      max-height: 36mm;
      margin: 0 auto 10px;
      object-fit: contain;
    }
    #pos-print-root .guest-chit .meta { margin: 10px 0; font-size: 13px; }
    #pos-print-root .guest-chit table { width: 100%; border-collapse: collapse; font-size: 13px; }
    #pos-print-root .guest-chit th { text-align: left; border-bottom: 1px solid #1a1612; padding: 4px 0; }
    #pos-print-root .guest-chit td { padding: 4px 0; border-bottom: 1px dotted #777; vertical-align: top; }
    #pos-print-root .guest-chit .qty { width: 8mm; }
    #pos-print-root .guest-chit .num, #pos-print-root .guest-chit th:last-child { width: 20mm; white-space: nowrap; }
    #pos-print-root .guest-chit .qty, #pos-print-root .guest-chit .num, #pos-print-root .guest-chit th:last-child { text-align: right; }
    #pos-print-root .total { font-size: 18px; font-weight: 800; display: flex; justify-content: space-between; margin-top: 10px; }
    #pos-print-root .thanks { text-align: center; margin: 12px 0 0; font-size: 12px; }
  `;
}

function printCss(extra: string) {
  return `
    ${sharedCss()}
    ${extra}
    #pos-print-root .receipt-bitmap {
      display: block;
      width: 80mm;
      height: auto;
      max-width: 80mm;
    }
    @media screen {
      #pos-print-root {
        position: fixed;
        left: 0;
        top: 0;
        z-index: -1;
        pointer-events: none;
      }
    }
    @media print {
      html, body, #root, #pos-print-root, #pos-print-root .slip {
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
      }
      html, body {
        width: 80mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        overflow: hidden !important;
      }
      body.is-printing > :not(#pos-print-root) {
        display: none !important;
      }
      #pos-print-root {
        position: static !important;
        z-index: auto !important;
        width: 80mm;
      }
      #pos-print-root .chit { break-inside: auto; }
    }
  `;
}

function cssPxToMm(px: number) {
  return px * 25.4 / 96;
}

function receiptPageBox(heightMm: number) {
  // Match the roll length to the rendered receipt. Keep only 2 mm after the
  // last line so the cutter clears it without feeding a fixed blank section.
  const pageMm = Math.max(20, Math.ceil(heightMm + 2));
  return `
    @page { size: 80mm ${pageMm}mm; margin: 0; }
    @media print {
      html, body {
        width: 80mm !important;
        height: ${pageMm}mm !important;
        max-height: ${pageMm}mm !important;
        overflow: hidden !important;
      }
    }
  `;
}

function receiptPageSize(root: HTMLElement) {
  const target =
    root.querySelector<HTMLElement>(".receipt-bitmap") ??
    root.querySelector<HTMLElement>(".chit") ??
    root;
  return receiptPageBox(cssPxToMm(target.getBoundingClientRect().height));
}

async function rasterizeChit(chit: HTMLElement, css: string) {
  const rect = chit.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;

  const scale = 2;
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">
  <foreignObject x="0" y="0" width="${width}" height="${height}">
    <div xmlns="http://www.w3.org/1999/xhtml" id="pos-print-root" style="width:${width}px;background:#fff;">
      <style>${css}#pos-print-root{position:static!important;}</style>
      ${chit.outerHTML}
    </div>
  </foreignObject>
</svg>`;

  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

let pendingPrint: Promise<void> = Promise.resolve();

function printSlip(extraCss: string, inner: string) {
  const job = pendingPrint.catch(() => {}).then(() => showPrintSlip(extraCss, inner));
  pendingPrint = job;
  return job;
}

function showPrintSlip(extraCss: string, inner: string) {
  document.getElementById("pos-print-root")?.remove();
  document.getElementById("pos-print-style")?.remove();

  const style = document.createElement("style");
  style.id = "pos-print-style";
  style.textContent = printCss(extraCss);

  const root = document.createElement("div");
  root.id = "pos-print-root";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<div class="slip">${inner}</div>`;

  document.head.appendChild(style);
  document.body.appendChild(root);
  document.body.classList.add("is-printing");
  const previousTitle = document.title;
  document.title = "";

  return new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("is-printing");
      document.title = previousTitle;
      style.remove();
      root.remove();
      resolve();
    };
    window.addEventListener("afterprint", done);
    // Let the WebView lay out the receipt before it takes its print snapshot.
    requestAnimationFrame(async () => {
      await Promise.all([
        document.fonts.ready,
        ...Array.from(root.querySelectorAll("img"), (img) => img.decode().catch(() => {})),
      ]);
      const chit = root.querySelector<HTMLElement>(".chit");
      if (chit) {
        const png = await rasterizeChit(chit, style.textContent ?? "");
        if (png) {
          root.innerHTML = `<div class="slip"><img class="receipt-bitmap" alt="" src="${png}" /></div>`;
          const bitmap = root.querySelector("img");
          if (bitmap) await bitmap.decode().catch(() => {});
        }
      }
      requestAnimationFrame(() => {
        if (settled) return;
        style.textContent += receiptPageSize(root);
        try {
          window.print();
          window.setTimeout(done, 120_000);
        } catch (error) {
          done();
          console.error("Could not open the print dialog", error);
        }
      });
    });
  });
}

export function printKitchenToken(
  order: PosOrder,
  brand: { restaurantName?: string } = {},
) {
  return printSlip(
    kitchenCss(),
    kitchenChitHtml(order, brand),
  );
}

export function printGuestBill(
  order: PosOrder,
  brand: { restaurantName?: string; logoDataUrl?: string | null } = {},
) {
  return printSlip(
    guestCss(),
    guestChitHtml(order, brand),
  );
}
