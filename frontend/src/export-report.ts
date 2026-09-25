export type ExportFormat = "csv" | "xlsx" | "pdf";

export type ReportPayload = {
  basename: string;
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
  totalLabel?: string;
  totalValue?: number;
};

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value: string | number) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(report: ReportPayload) {
  const lines = [
    report.headers.map(csvEscape).join(","),
    ...report.rows.map((row) => row.map(csvEscape).join(",")),
  ];
  if (report.totalLabel) {
    const pad = Array(Math.max(0, report.headers.length - 2)).fill("");
    lines.push([report.totalLabel, ...pad, report.totalValue ?? ""].map(csvEscape).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colLetter(index: number) {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function xlsxCell(row: number, col: number, value: string | number) {
  const ref = `${colLetter(col)}${row}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(String(value))}</t></is></c>`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of data) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concat(chunks: Uint8Array[]) {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function zipStore(files: { name: string; data: Uint8Array }[]) {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      encoder.encode("PK\u0003\u0004"),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    const central = concat([
      encoder.encode("PK\u0001\u0002"),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = concat(centrals);
  const end = concat([
    encoder.encode("PK\u0005\u0006"),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, centralDir, end]);
}

function toXlsx(report: ReportPayload) {
  const allRows: (string | number)[][] = [report.headers, ...report.rows];
  if (report.totalLabel) {
    const pad = Array(Math.max(0, report.headers.length - 2)).fill("");
    allRows.push([report.totalLabel, ...pad, report.totalValue ?? ""]);
  }

  const sheetRows = allRows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, col) => xlsxCell(rowIndex + 1, col, value))
          .join("")}</row>`,
    )
    .join("");

  const lastCol = colLetter(Math.max(0, report.headers.length - 1));
  const encoder = new TextEncoder();
  const files = [
    {
      name: "[Content_Types].xml",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCol}${allRows.length}"/>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`),
    },
  ];

  return zipStore(files);
}

function pdfEscape(text: string) {
  let out = "";
  for (const char of text) {
    if (char === "(" || char === ")" || char === "\\") {
      out += `\\${char}`;
      continue;
    }
    const code = char.charCodeAt(0);
    if (code === 0xd7) {
      out += "\\327";
      continue;
    }
    if (code < 32 || code > 126) {
      out += code <= 255 ? `\\${code.toString(8).padStart(3, "0")}` : "?";
      continue;
    }
    out += char;
  }
  return out;
}

function wrapCell(text: string, width: number, charWidth: number) {
  const max = Math.max(4, Math.floor(width / charWidth));
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= max) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (word.length <= max) {
      current = word;
    } else {
      for (let i = 0; i < word.length; i += max) {
        lines.push(word.slice(i, i + max));
      }
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function toPdf(report: ReportPayload) {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 36;
  const headers = report.headers;
  const colCount = headers.length;
  const usable = pageWidth - margin * 2;
  const weights = headers.map((header) => {
    if (/item/i.test(header) || /note/i.test(header) || /title/i.test(header)) return 2.6;
    if (/amount/i.test(header)) return 1.1;
    return 1;
  });
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map((weight) => (weight / weightSum) * usable);
  const lineH = 12;
  const charW = 5.1;

  type PdfRow = { cells: string[][]; height: number };
  function measure(values: (string | number)[]): PdfRow {
    const cells = values.map((value, index) =>
      wrapCell(String(value), widths[index] - 8, charW),
    );
    return { cells, height: Math.max(1, ...cells.map((cell) => cell.length)) * lineH + 6 };
  }

  const headRow = measure(headers);
  const body = report.rows.map(measure);
  if (report.totalLabel) {
    const pad = Array(Math.max(0, colCount - 2)).fill("");
    body.push(measure([report.totalLabel, ...pad, report.totalValue ?? ""]));
  }

  const topMatter = 64;
  const pages: PdfRow[][] = [];
  let bucket: PdfRow[] = [];
  let used = topMatter + headRow.height;
  for (const row of body) {
    if (used + row.height > pageHeight - margin && bucket.length) {
      pages.push(bucket);
      bucket = [];
      used = topMatter + headRow.height;
    }
    bucket.push(row);
    used += row.height;
  }
  if (bucket.length || pages.length === 0) pages.push(bucket);

  function drawPage(pageRows: PdfRow[], pageIndex: number, pageCount: number) {
    const ops: string[] = [];
    const text = (x: number, y: number, size: number, value: string, bold = false) => {
      ops.push("BT");
      ops.push(`/${bold ? "F2" : "F1"} ${size} Tf`);
      ops.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`);
      ops.push(`(${pdfEscape(value)}) Tj`);
      ops.push("ET");
    };

    text(margin, pageHeight - 28, 14, report.title, true);
    text(margin, pageHeight - 44, 9, report.subtitle);
    text(
      pageWidth - margin - 120,
      pageHeight - 28,
      9,
      `Page ${pageIndex + 1} of ${pageCount}`,
    );

    let y = pageHeight - topMatter;
    const paintRow = (row: PdfRow, header: boolean) => {
      let x = margin;
      if (header) {
        ops.push("0.92 0.90 0.88 rg");
        ops.push(
          `${margin} ${y - row.height + 4} ${usable} ${row.height} re f`,
        );
        ops.push("0 0 0 rg");
      }
      row.cells.forEach((lines, col) => {
        lines.forEach((line, lineIndex) => {
          text(
            x + 4,
            y - 12 - lineIndex * lineH,
            8,
            line,
            header,
          );
        });
        x += widths[col];
      });
      ops.push("0.85 0.82 0.78 RG");
      ops.push("0.4 w");
      ops.push(
        `${margin} ${y - row.height + 4} ${usable} 0 m ${margin + usable} ${y - row.height + 4} l S`,
      );
      y -= row.height;
    };

    paintRow(headRow, true);
    for (const row of pageRows) paintRow(row, false);
    return ops.join("\n");
  }

  const encoder = new TextEncoder();
  const objects: Uint8Array[] = [];
  const add = (body: string) => {
    objects.push(encoder.encode(body));
    return objects.length;
  };

  add("<< /Type /Catalog /Pages 2 0 R >>");
  const pageCount = pages.length;
  const pageIds = pages.map((_, index) => 3 + index * 2);
  const contentIds = pages.map((_, index) => 4 + index * 2);
  add(
    `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  );

  const streams = pages.map((pageRows, index) =>
    drawPage(pageRows, index, pageCount),
  );

  streams.forEach((stream, index) => {
    const streamBytes = encoder.encode(stream);
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${3 + pageCount * 2} 0 R /F2 ${4 + pageCount * 2} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`,
    );
    add(`<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`);
  });
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const header = encoder.encode("%PDF-1.4\n");
  const chunks: Uint8Array[] = [header];
  const offsets = [0];
  let cursor = header.length;
  objects.forEach((object, index) => {
    const block = encoder.encode(`${index + 1} 0 obj\n`);
    const end = encoder.encode("\nendobj\n");
    offsets.push(cursor);
    chunks.push(block, object, end);
    cursor += block.length + object.length + end.length;
  });

  const xrefStart = cursor;
  const xrefLines = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((off) => `${String(off).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`,
    `startxref\n${xrefStart}\n%%EOF`,
  ];
  chunks.push(encoder.encode(xrefLines.join("")));
  return concat(chunks);
}

export function downloadReport(report: ReportPayload, format: ExportFormat) {
  if (format === "csv") {
    downloadBlob(
      `${report.basename}.csv`,
      new Blob([toCsv(report)], { type: "text/csv;charset=utf-8" }),
    );
    return;
  }
  if (format === "xlsx") {
    downloadBlob(
      `${report.basename}.xlsx`,
      new Blob([toXlsx(report)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    return;
  }
  downloadBlob(
    `${report.basename}.pdf`,
    new Blob([toPdf(report)], { type: "application/pdf" }),
  );
}

export function rangeLabel(
  from: string,
  to: string,
  fromTime = "00:00",
  toTime = "23:59",
) {
  const wholeDays = fromTime === "00:00" && toTime === "23:59";
  if (from === to && wholeDays) return from;
  if (wholeDays) return `${from} to ${to}`;
  if (from === to) return `${from} ${fromTime}–${toTime}`;
  return `${from} ${fromTime} to ${to} ${toTime}`;
}

export function fileStamp(
  from: string,
  to: string,
  fromTime = "00:00",
  toTime = "23:59",
) {
  const wholeDays = fromTime === "00:00" && toTime === "23:59";
  const start = wholeDays ? from : `${from}-${fromTime.replace(":", "")}`;
  const end = wholeDays ? to : `${to}-${toTime.replace(":", "")}`;
  return start === end ? start : `${start}_to_${end}`;
}
