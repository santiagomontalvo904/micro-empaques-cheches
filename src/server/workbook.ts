import path from "node:path";
import { inflateRawSync } from "node:zlib";
import type { Cell, WorkbookPreview } from "@/types/plant";

function decodeXml(value: string) {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`))?.[1] ?? "";
}

function zipEntries(buffer: Buffer) {
  let eocd = -1;
  for (
    let i = buffer.length - 22;
    i >= Math.max(0, buffer.length - 65557);
    i--
  ) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("El archivo no parece un libro .xlsx válido.");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, string>();
  let remaining = 64 * 1024 * 1024;
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("Índice ZIP del Excel no válido.");
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .toString("utf8", offset + 46, offset + 46 + nameLength)
      .replaceAll("\\", "/");
    const dataStart =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    const compressed = buffer.subarray(dataStart, dataStart + size);
    const expandedSize = buffer.readUInt32LE(offset + 24);
    if (expandedSize > remaining)
      throw new Error(
        "El contenido descomprimido del Excel supera el límite permitido.",
      );
    let content;
    if (method === 0) content = compressed;
    else if (method === 8)
      content = inflateRawSync(compressed, {
        maxOutputLength: Math.max(1, remaining),
      });
    else throw new Error("El Excel usa una compresión no compatible.");
    remaining -= content.length;
    if (remaining < 0)
      throw new Error(
        "El contenido descomprimido del Excel supera el límite permitido.",
      );
    entries.set(name, content.toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function columnNumber(ref: string) {
  const letters = ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  let n = 0;
  for (const c of letters) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}

function parseXlsx(buffer: Buffer, requestedSheet = "") {
  const entries = zipEntries(buffer);
  const workbook = entries.get("xl/workbook.xml");
  const relationships = entries.get("xl/_rels/workbook.xml.rels");
  if (!workbook || !relationships)
    throw new Error("No se encontró la estructura de hojas del Excel.");
  const sheetDefs = [...workbook.matchAll(/<sheet\b[^>]*\/?\s*>/g)].map(
    (match) => ({
      tag: match[0],
      name: decodeXml(attr(match[0], "name")) || "Hoja",
      id: attr(match[0], "r:id"),
    }),
  );
  if (!sheetDefs.length)
    throw new Error("El libro no contiene hojas de cálculo.");
  const selected = requestedSheet
    ? sheetDefs.find((s) => s.name === requestedSheet)
    : sheetDefs[0];
  if (!selected)
    throw new Error("No se encontró la hoja seleccionada en el libro.");
  const relationship = [
    ...relationships.matchAll(/<Relationship\b[^>]*\/?\s*>/g),
  ].find((m) => attr(m[0], "Id") === selected.id);
  if (!relationship)
    throw new Error("No se pudo localizar la primera hoja del Excel.");
  const sheetName = selected.name;
  const target = attr(relationship[0], "Target");
  const sheetPath = target.startsWith("/")
    ? target.slice(1)
    : path.posix.normalize(path.posix.join("xl", target));
  const sheetXml = entries.get(sheetPath);
  if (!sheetXml) throw new Error("No se pudo leer la primera hoja del Excel.");
  const sharedXml = entries.get("xl/sharedStrings.xml") || "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(
    (m) =>
      [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
        .map((t) => decodeXml(t[1]))
        .join(""),
  );
  const grid: Cell[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Cell[] = [];
    for (const cell of rowMatch[1].matchAll(
      /<c\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const column = columnNumber(attr(cell[1], "r"));
      const type = attr(cell[1], "t");
      const inner = cell[2] || "";
      const value = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
      let parsed: Cell = value;
      if (type === "s") parsed = shared[Number(value)] ?? "";
      else if (type === "inlineStr")
        parsed = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
          .map((t) => decodeXml(t[1]))
          .join("");
      else if (type === "b") parsed = value === "1" ? "TRUE" : "FALSE";
      else if (type === "str") parsed = decodeXml(value);
      else if (value !== "" && Number.isFinite(Number(value)))
        parsed = Number(value);
      row[column] = parsed;
    }
    grid.push(row);
  }
  return { sheet: sheetName, sheets: sheetDefs.map((s) => s.name), grid };
}

function parseCsv(buffer: Buffer) {
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"]
    .map(
      (delimiter) =>
        [delimiter, [...first].filter((c) => c === delimiter).length] as const,
    )
    .sort((a, b) => b[1] - a[1]);
  const delimiter = counts[0][0];
  const rows = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') {
      field += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (!quoted && c === delimiter) {
      row.push(field);
      field = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim())) rows.push(row);
  return { sheet: "CSV", grid: rows };
}

export function workbookPreview(
  buffer: Buffer,
  filename: string,
  requestedSheet = "",
): WorkbookPreview {
  const parsed = filename.toLowerCase().endsWith(".csv")
    ? parseCsv(buffer)
    : parseXlsx(buffer, requestedSheet);
  const nonempty = parsed.grid.filter((row) =>
    row.some((cell) => cell !== undefined && String(cell).trim() !== ""),
  );
  if (!nonempty.length) throw new Error("La hoja está vacía.");
  const headers = Array.from(
    nonempty[0],
    (value, i) => String(value ?? "").trim() || `Columna ${i + 1}`,
  );
  const rows = nonempty
    .slice(1)
    .map((row) => headers.map((_, i) => row[i] ?? ""));
  return {
    file: filename,
    sheet: parsed.sheet,
    sheets: "sheets" in parsed ? parsed.sheets! : [parsed.sheet],
    headers,
    rows,
  };
}
