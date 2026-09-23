import { chromium } from "/home/salman/Projects/restaurant-pos/frontend/node_modules/@playwright/test/index.mjs";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../examples");

const kitchenCss = `
  #pos-print-root { width: 80mm; margin: 0; padding: 0; color: #1a1612; background: #fff; font-family: Arial, "Segoe UI", sans-serif; font-size: 12px; line-height: 1.25; }
  #pos-print-root .slip { width: 80mm; margin: 0; padding: 0; box-sizing: border-box; }
  #pos-print-root .chit { width: 80mm; margin: 0; padding: 2mm 4mm 4mm; box-sizing: border-box; overflow-wrap: anywhere; }
  #pos-print-root table { table-layout: fixed; }
  #pos-print-root .kicker { text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  #pos-print-root .kitchen { text-align: center; font-size: 22px; font-weight: 800; margin: 4px 0 0; letter-spacing: 0.04em; }
  #pos-print-root .token { text-align: center; font-size: 56px; font-weight: 900; line-height: 1; margin: 8px 0 4px; }
  #pos-print-root .kitchen-chit .meta { text-align: center; font-size: 14px; margin-bottom: 10px; }
  #pos-print-root .kitchen-chit table { width: 100%; border-collapse: collapse; font-size: 16px; }
  #pos-print-root .kitchen-chit td { padding: 5px 0; border-bottom: 1px dashed #1a1612; vertical-align: top; }
  #pos-print-root .kitchen-chit .qty { width: 14mm; font-weight: 900; font-size: 20px; }
  #pos-print-root .foot { text-align: center; margin: 8px 0 0; font-size: 12px; font-weight: 700; }
`;

const guestCss = `
  #pos-print-root { width: 80mm; margin: 0; padding: 0; color: #1a1612; background: #fff; font-family: Arial, "Segoe UI", sans-serif; font-size: 12px; line-height: 1.25; }
  #pos-print-root .slip { width: 80mm; margin: 0; padding: 0; box-sizing: border-box; }
  #pos-print-root .chit { width: 80mm; margin: 0; padding: 2mm 4mm 4mm; box-sizing: border-box; overflow-wrap: anywhere; }
  #pos-print-root table { table-layout: fixed; }
  #pos-print-root .guest-chit h1 { font-size: 16px; margin: 0; letter-spacing: 0.02em; }
  #pos-print-root .brand { display: flex; flex-direction: column; align-items: center; text-align: center; border-bottom: 2px dashed #1a1612; padding-bottom: 10px; }
  #pos-print-root .guest-chit .meta { margin: 10px 0; font-size: 13px; }
  #pos-print-root .guest-chit table { width: 100%; border-collapse: collapse; font-size: 13px; }
  #pos-print-root .guest-chit th { text-align: left; border-bottom: 1px solid #1a1612; padding: 4px 0; }
  #pos-print-root .guest-chit td { padding: 4px 0; border-bottom: 1px dotted #777; vertical-align: top; }
  #pos-print-root .guest-chit .qty { width: 8mm; }
  #pos-print-root .guest-chit .num, #pos-print-root .guest-chit th:last-child { width: 20mm; white-space: nowrap; text-align: right; }
  #pos-print-root .guest-chit .qty { text-align: right; }
  #pos-print-root .total { font-size: 18px; font-weight: 800; display: flex; justify-content: space-between; margin-top: 10px; }
  #pos-print-root .thanks { text-align: center; margin: 12px 0 0; font-size: 12px; }
`;

const kitchenHtml = `
  <article class="chit kitchen-chit">
    <div class="kicker">Restaurant</div>
    <h1 class="kitchen">Kitchen · کچن</h1>
    <div class="token">34</div>
    <div class="meta">
      <div>Takeaway</div>
      <div>2026-09-22 · 16:40</div>
    </div>
    <table>
      <tbody>
        <tr><td class="qty">1×</td><td>Chicken Karahi (Half)</td></tr>
        <tr><td class="qty">4×</td><td>Tandoori Roti</td></tr>
        <tr><td class="qty">2×</td><td>Fresh Lassi</td></tr>
      </tbody>
    </table>
    <p class="foot">7 items · Token 34</p>
  </article>
`;

const guestHtml = `
  <article class="chit guest-chit">
    <div class="brand">
      <h1>Restaurant</h1>
      <div>Guest bill</div>
    </div>
    <div class="meta">
      <div>Token 34</div>
      <div>Takeaway</div>
      <div>2026-09-22 · 16:40</div>
    </div>
    <table>
      <thead><tr><th>Item</th><th></th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>Chicken Karahi (Half)</td><td class="qty">1</td><td class="num">Rs 950</td></tr>
        <tr><td>Tandoori Roti</td><td class="qty">4</td><td class="num">Rs 100</td></tr>
        <tr><td>Fresh Lassi</td><td class="qty">2</td><td class="num">Rs 360</td></tr>
      </tbody>
    </table>
    <div class="total"><span>Total</span><span>Rs 1,410</span></div>
    <p class="thanks">شکریہ · Paid · Cash</p>
  </article>
`;

async function rasterize(page, css, inner, fileName) {
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head>
    <body style="margin:0;background:#fff">
      <div id="pos-print-root"><div class="slip">${inner}</div></div>
    </body></html>`);

  const dataUrl = await page.evaluate(async (cssText) => {
    const chit = document.querySelector(".chit");
    const rect = chit.getBoundingClientRect();
    const scale = 2;
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">
  <foreignObject x="0" y="0" width="${width}" height="${height}">
    <div xmlns="http://www.w3.org/1999/xhtml" id="pos-print-root" style="width:${width}px;background:#fff;">
      <style>${cssText}#pos-print-root{position:static!important;}</style>
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
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return {
        png: canvas.toDataURL("image/png"),
        width,
        height,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }, css);

  const pngPath = resolve(outDir, fileName);
  if (dataUrl?.png?.startsWith("data:image/png")) {
    writeFileSync(pngPath, Buffer.from(dataUrl.png.split(",")[1], "base64"));
  }
  const shotPath = resolve(outDir, fileName.replace(".png", "-layout.png"));
  await page.locator("#pos-print-root").screenshot({ path: shotPath });
  return { pngPath, shotPath, width: dataUrl.width, height: dataUrl.height };
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 900 } });
const kitchen = await rasterize(page, kitchenCss, kitchenHtml, "print-kitchen.png");
const guest = await rasterize(page, guestCss, guestHtml, "print-guest.png");
await browser.close();
console.log(JSON.stringify({ kitchen, guest }, null, 2));
