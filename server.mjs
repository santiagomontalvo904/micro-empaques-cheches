import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const DATA_FILE = path.join(DATA_DIR, 'planta.json');
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups'));
const REQUIRE_SEPARATE_BACKUP = process.env.REQUIRE_SEPARATE_BACKUP === '1';
const SEED_FILE = path.join(ROOT, 'demo-data.json');
const MAX_STATE_BYTES = 4 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

let state;
let revision = 0;
let committedMutationIds = [];
let lastBackupAt = null;
let lastBackupFile = null;
let writeQueue = Promise.resolve();

function json(res, status, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}

function validateState(value) {
  return value && typeof value === 'object' && Array.isArray(value.orders) && Array.isArray(value.routes) && value.machines && typeof value.machines === 'object';
}

async function syncDirectory(directory) {
  try { const handle = await fs.open(directory, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
  catch { /* Directory fsync is unavailable on some Windows filesystems. */ }
}

async function atomicSave(nextState, nextRevision, mutationIds = committedMutationIds) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const temporary = `${DATA_FILE}.${process.pid}.${randomUUID()}.tmp`;
  const stamp = new Date().toISOString();
  const backupPath = path.join(BACKUP_DIR, `planta-r${nextRevision}-${stamp.replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.json`);
  const envelope = { revision: nextRevision, savedAt: stamp, lastBackupAt: stamp, lastBackupFile: backupPath, committedMutationIds: mutationIds, state: nextState };
  const bytes = JSON.stringify(envelope, null, 2);
  const handle = await fs.open(temporary, 'wx');
  try { await handle.writeFile(bytes, 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  let backupHandle;
  try {
    backupHandle = await fs.open(backupPath, 'wx');
    await backupHandle.writeFile(bytes, 'utf8');
    await backupHandle.sync();
    await backupHandle.close();
    backupHandle = null;
    await syncDirectory(BACKUP_DIR);
    await fs.rename(temporary, DATA_FILE);
    await syncDirectory(DATA_DIR);
    lastBackupAt = stamp;
    lastBackupFile = backupPath;
  }
  catch (error) { await fs.rm(temporary, { force: true }).catch(() => {}); throw error; }
  finally { if (backupHandle) await backupHandle.close().catch(() => {}); }
}

async function readEnvelope(file) {
  let parsed;
  try { parsed = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  return validateState(parsed?.state) && Number.isInteger(parsed?.revision) ? parsed : null;
}

async function newestBackup() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const names = await fs.readdir(BACKUP_DIR);
  const snapshots = [];
  for (const name of names) {
    if (!/^planta-r\d+-.*\.json$/i.test(name)) continue;
    const file = path.join(BACKUP_DIR, name);
    const envelope = await readEnvelope(file);
    if (envelope) snapshots.push({ file, envelope });
  }
  snapshots.sort((a, b) => b.envelope.revision - a.envelope.revision || String(b.envelope.savedAt || '').localeCompare(String(a.envelope.savedAt || '')));
  return snapshots[0] || null;
}

async function restoreEnvelope(envelope) {
  const temporary = `${DATA_FILE}.${process.pid}.${randomUUID()}.restore.tmp`;
  const handle = await fs.open(temporary, 'wx');
  try { await handle.writeFile(JSON.stringify(envelope, null, 2), 'utf8'); await handle.sync(); }
  finally { await handle.close(); }
  try { await fs.rename(temporary, DATA_FILE); await syncDirectory(DATA_DIR); }
  catch (error) { await fs.rm(temporary, { force: true }).catch(() => {}); throw error; }
}

async function initialize() {
  if (REQUIRE_SEPARATE_BACKUP) {
    const dataRoot = path.parse(DATA_DIR).root.toLowerCase();
    const backupRoot = path.parse(BACKUP_DIR).root.toLowerCase();
    if (!dataRoot || !backupRoot || dataRoot === backupRoot) throw new Error('La configuración exige que datos y respaldos estén en unidades distintas.');
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  let disk = await readEnvelope(DATA_FILE);
  const backup = await newestBackup();
  if (backup && (!disk || backup.envelope.revision > disk.revision)) {
    await restoreEnvelope(backup.envelope);
    disk = backup.envelope;
    lastBackupAt = disk.lastBackupAt || disk.savedAt || null;
    lastBackupFile = backup.file;
  }
  if (disk) {
    state = disk.state;
    revision = disk.revision;
    committedMutationIds = Array.isArray(disk.committedMutationIds) ? disk.committedMutationIds.slice(-200) : [];
    lastBackupAt = lastBackupAt || disk.lastBackupAt || null;
    lastBackupFile = lastBackupFile || disk.lastBackupFile || null;
  } else {
    let fileExists = true;
    try { await fs.access(DATA_FILE); } catch (error) { if (error.code === 'ENOENT') fileExists = false; else throw error; }
    if (fileExists) throw new Error(`El archivo ${DATA_FILE} está dañado y no existe una copia válida para recuperarlo.`);
    state = JSON.parse(await fs.readFile(SEED_FILE, 'utf8'));
    if (!validateState(state)) throw new Error('El archivo de datos de demostración no es válido.');
    revision = 1;
    await atomicSave(state, revision);
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(Object.assign(new Error('El archivo supera el tamaño permitido.'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function decodeXml(value) {
  return value.replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function attr(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`))?.[1] ?? '';
}

function zipEntries(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('El archivo no parece un libro .xlsx válido.');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Índice ZIP del Excel no válido.');
    const method = buffer.readUInt16LE(offset + 10);
    const size = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength).replaceAll('\\', '/');
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const compressed = buffer.subarray(dataStart, dataStart + size);
    let content;
    if (method === 0) content = compressed;
    else if (method === 8) content = inflateRawSync(compressed);
    else throw new Error('El Excel usa una compresión no compatible.');
    entries.set(name, content.toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function columnNumber(ref) {
  const letters = ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  let n = 0;
  for (const c of letters) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}

function parseXlsx(buffer, requestedSheet = '') {
  const entries = zipEntries(buffer);
  const workbook = entries.get('xl/workbook.xml');
  const relationships = entries.get('xl/_rels/workbook.xml.rels');
  if (!workbook || !relationships) throw new Error('No se encontró la estructura de hojas del Excel.');
  const sheetDefs = [...workbook.matchAll(/<sheet\b[^>]*\/?\s*>/g)].map(match => ({ tag: match[0], name: decodeXml(attr(match[0], 'name')) || 'Hoja', id: attr(match[0], 'r:id') }));
  if (!sheetDefs.length) throw new Error('El libro no contiene hojas de cálculo.');
  const selected = requestedSheet ? sheetDefs.find(s => s.name === requestedSheet) : sheetDefs[0];
  if (!selected) throw new Error('No se encontró la hoja seleccionada en el libro.');
  const relationship = [...relationships.matchAll(/<Relationship\b[^>]*\/?\s*>/g)].find(m => attr(m[0], 'Id') === selected.id);
  if (!relationship) throw new Error('No se pudo localizar la primera hoja del Excel.');
  const sheetName = selected.name;
  const target = attr(relationship[0], 'Target');
  const sheetPath = target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join('xl', target));
  const sheetXml = entries.get(sheetPath);
  if (!sheetXml) throw new Error('No se pudo leer la primera hoja del Excel.');
  const sharedXml = entries.get('xl/sharedStrings.xml') || '';
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => decodeXml(t[1])).join(''));
  const grid = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\s*\/>|>([\s\S]*?)<\/c>)/g)) {
      const column = columnNumber(attr(cell[1], 'r'));
      const type = attr(cell[1], 't');
      const inner = cell[2] || '';
      const value = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '';
      let parsed = value;
      if (type === 's') parsed = shared[Number(value)] ?? '';
      else if (type === 'inlineStr') parsed = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(t => decodeXml(t[1])).join('');
      else if (type === 'b') parsed = value === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str') parsed = decodeXml(value);
      else if (value !== '' && Number.isFinite(Number(value))) parsed = Number(value);
      row[column] = parsed;
    }
    grid.push(row);
  }
  return { sheet: sheetName, sheets: sheetDefs.map(s => s.name), grid };
}

function parseCsv(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t'].map(delimiter => [delimiter, [...first].filter(c => c === delimiter).length]).sort((a, b) => b[1] - a[1]);
  const delimiter = counts[0][0];
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (!quoted && c === delimiter) { row.push(field); field = ''; }
    else if (!quoted && (c === '\n' || c === '\r')) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  return { sheet: 'CSV', grid: rows };
}

function workbookPreview(buffer, filename, requestedSheet = '') {
  const parsed = filename.toLowerCase().endsWith('.csv') ? parseCsv(buffer) : parseXlsx(buffer, requestedSheet);
  const nonempty = parsed.grid.filter(row => row.some(cell => cell !== undefined && String(cell).trim() !== ''));
  if (!nonempty.length) throw new Error('La hoja está vacía.');
  const headers = nonempty[0].map((value, i) => String(value ?? '').trim() || `Columna ${i + 1}`);
  const rows = nonempty.slice(1).map(row => headers.map((_, i) => row[i] ?? ''));
  return { file: filename, sheet: parsed.sheet, sheets: parsed.sheets || [parsed.sheet], headers, rows };
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, revision, dataFile: DATA_FILE, backupDir: BACKUP_DIR, lastBackupAt, lastBackupFile });
  if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, { revision, state, lastBackupAt, lastBackupFile, committedMutationIds }, { ETag: `"${revision}"` });
  if (req.method === 'PUT' && url.pathname === '/api/state') {
    const expected = Number(String(req.headers['if-match'] || '').replaceAll('"', ''));
    const mutationId = String(req.headers['x-request-id'] || '').trim();
    if (!mutationId || mutationId.length > 120) return json(res, 400, { error: 'Falta el identificador idempotente de la escritura.' });
    let next;
    try { next = JSON.parse((await readBody(req, MAX_STATE_BYTES)).toString('utf8')); }
    catch (error) { return json(res, error.status || 400, { error: error.message || 'JSON no válido.' }); }
    if (!validateState(next)) return json(res, 400, { error: 'La estructura de datos no es válida.' });
    try {
      const operation = writeQueue.then(async () => {
        if (committedMutationIds.includes(mutationId)) return { conflict: false, duplicate: true };
        if (!Number.isInteger(expected) || expected !== revision) return { conflict: true };
        const nextRevision = revision + 1;
        const nextMutationIds = [...committedMutationIds, mutationId].slice(-200);
        await atomicSave(next, nextRevision, nextMutationIds);
        state = next;
        revision = nextRevision;
        committedMutationIds = nextMutationIds;
        return { conflict: false, duplicate: false };
      });
      writeQueue = operation.then(() => undefined, () => undefined);
      const result = await operation;
      if (result.conflict) return json(res, 409, { error: 'Los datos cambiaron en otra sesión. Recarga para recibir la versión del servidor.', revision });
      const payload = { ok: true, duplicate: result.duplicate, revision, lastBackupAt, lastBackupFile };
      if (result.duplicate) payload.state = state;
      return json(res, 200, payload, { ETag: `"${revision}"` });
    } catch (error) {
      return json(res, 500, { error: `No se pudo guardar en disco: ${error.message}` });
    }
  }
  const imageMatch = url.pathname.match(/^\/api\/order-images\/([0-9a-f-]{36})$/i);
  if (imageMatch) {
    const id = imageMatch[1].toLowerCase();
    const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
    if (req.method === 'PUT') {
      if (!extensions[contentType]) return json(res, 415, { error: 'Usa una imagen PNG, JPG o WEBP.' });
      let bytes; try { bytes = await readBody(req, MAX_IMAGE_BYTES); } catch (error) { return json(res, error.status || 400, { error: error.message }); }
      if (!bytes.length) return json(res, 400, { error: 'El archivo está vacío.' });
      const name = decodeURIComponent(String(req.headers['x-file-name'] || '').replace(/[\/\0]/g, '_')).slice(0, 180) || 'plano' + extensions[contentType];
      const dirs = [path.join(DATA_DIR, 'order-images'), path.join(BACKUP_DIR, 'order-images')];
      try {
        for (const directory of dirs) {
          await fs.mkdir(directory, { recursive: true });
          const target = path.join(directory, id + extensions[contentType]);
          const temporary = target + '.' + process.pid + '.' + randomUUID() + '.tmp';
          const handle = await fs.open(temporary, 'wx');
          try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
          await fs.rename(temporary, target); await syncDirectory(directory);
        }
        return json(res, 201, { ok: true, id, name, contentType });
      } catch (error) { return json(res, 500, { error: 'No se pudo guardar el adjunto.' }); }
    }
    if (req.method === 'GET') {
      for (const extension of Object.values(extensions)) {
        for (const directory of [path.join(DATA_DIR, 'order-images'), path.join(BACKUP_DIR, 'order-images')]) {
          try {
            const target = path.join(directory, id + extension), bytes = await fs.readFile(target);
            res.writeHead(200, { 'Content-Type': Object.entries(extensions).find(([, ext]) => ext === extension)[0], 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
            return res.end(bytes);
          } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
      return json(res, 404, { error: 'No se encontró el adjunto.' });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/import/preview') {
    try {
      const filename = decodeURIComponent(req.headers['x-file-name'] || 'ordenes.xlsx').replace(/[\\/\0]/g, '_');
      if (!/\.(xlsx|csv)$/i.test(filename)) return json(res, 415, { error: 'Formato no compatible. Usa .xlsx o un CSV exportado desde Excel.' });
      const buffer = await readBody(req, MAX_WORKBOOK_BYTES);
      const requestedSheet = decodeURIComponent(req.headers['x-sheet-name'] || '');
      return json(res, 200, workbookPreview(buffer, filename, requestedSheet));
    } catch (error) { return json(res, error.status || 400, { error: error.message || 'No se pudo leer el libro.' }); }
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const page = await fs.readFile(path.join(ROOT, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': page.length, 'Cache-Control': 'no-store' });
    return res.end(page);
  }
  return json(res, 404, { error: 'Ruta no encontrada.' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await initialize();
  http.createServer((req, res) => { handle(req, res).catch(error => { console.error(error); if (!res.headersSent) json(res, 500, { error: 'Error interno del servicio.' }); else res.destroy(); }); }).listen(PORT, HOST, () => {
    console.log(`Micro Empaques Cheches disponible en http://${HOST}:${PORT}`);
    console.log(`Datos persistentes: ${DATA_FILE}`);
    console.log('Servicio local sin dependencias ni conexiones externas.');
  });
}

export { workbookPreview, initialize, handle };
