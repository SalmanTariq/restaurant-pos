function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function u32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

function concat(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export type ZipEntry = { name: string; data: Uint8Array };

export function zipStore(files: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime =
    ((now.getHours() & 31) << 11) |
    ((now.getMinutes() & 63) << 5) |
    (Math.floor(now.getSeconds() / 2) & 31);
  const dosDate =
    (((now.getFullYear() - 1980) & 127) << 9) |
    (((now.getMonth() + 1) & 15) << 5) |
    (now.getDate() & 31);

  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length + file.data.length);
    const view = new DataView(local.buffer, local.byteOffset, local.byteLength);
    u32(view, 0, 0x04034b50);
    u16(view, 4, 20);
    u16(view, 6, 1 << 11);
    u16(view, 8, 0);
    u16(view, 10, dosTime);
    u16(view, 12, dosDate);
    u32(view, 14, crc);
    u32(view, 18, file.data.length);
    u32(view, 22, file.data.length);
    u16(view, 26, name.length);
    u16(view, 28, 0);
    local.set(name, 30);
    local.set(file.data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer, central.byteOffset, central.byteLength);
    u32(centralView, 0, 0x02014b50);
    u16(centralView, 4, 20);
    u16(centralView, 6, 20);
    u16(centralView, 8, 1 << 11);
    u16(centralView, 10, 0);
    u16(centralView, 12, dosTime);
    u16(centralView, 14, dosDate);
    u32(centralView, 16, crc);
    u32(centralView, 20, file.data.length);
    u32(centralView, 24, file.data.length);
    u16(centralView, 26, name.length);
    u16(centralView, 28, 0);
    u16(centralView, 30, 0);
    u16(centralView, 32, 0);
    u16(centralView, 34, 0);
    u32(centralView, 36, 0);
    u32(centralView, 40, offset);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = concat(centrals);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer, end.byteOffset, end.byteLength);
  u32(endView, 0, 0x06054b50);
  u16(endView, 8, files.length);
  u16(endView, 10, files.length);
  u32(endView, 12, centralDir.length);
  u32(endView, 16, offset);
  return concat([...locals, centralDir, end]);
}

export function unzipStore(buffer: Uint8Array): ZipEntry[] {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const files: ZipEntry[] = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && view.getUint32(offset, true) === 0x04034b50) {
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 22, true);
    if (method !== 0) {
      throw new Error("Use an uncompressed inventory zip, or import the CSV.");
    }
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(buffer.subarray(nameStart, nameStart + nameLen));
    const start = nameStart + nameLen + extraLen;
    files.push({ name, data: buffer.slice(start, start + size) });
    offset = start + size;
  }
  if (files.length === 0) throw new Error("That zip file is not valid.");
  return files;
}
