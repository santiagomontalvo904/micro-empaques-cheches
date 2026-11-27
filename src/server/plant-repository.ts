import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { replaceFile } from "./durable-file";
import seed from "../../demo-data.json";
import type { PlantSnapshot, PlantState } from "@/types/plant";
import { backupDir, dataDir, dataFile, requireSeparateBackup } from "./config";

type Envelope = PlantSnapshot & { savedAt?: string };

export function isPlantState(value: unknown): value is PlantState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<PlantState>;
  return (
    Array.isArray(state.orders) &&
    Array.isArray(state.routes) &&
    !!state.machines &&
    typeof state.machines === "object" &&
    !Array.isArray(state.machines)
  );
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function save(
  state: PlantState,
  revision: number,
  committedMutationIds: string[],
) {
  const stamp = new Date().toISOString();
  const file = path.join(
    backupDir,
    `planta-r${revision}-${stamp.replaceAll(":", "-")}-${randomUUID().slice(0, 8)}.json`,
  );
  const envelope: Envelope = {
    revision,
    state,
    savedAt: stamp,
    lastBackupAt: stamp,
    lastBackupFile: file,
    committedMutationIds,
  };
  const bytes = JSON.stringify(envelope, null, 2);
  await replaceFile(dataFile, bytes, () => replaceFile(file, bytes));
  return envelope;
}

async function readEnvelope(file: string): Promise<Envelope | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Envelope;
    return isPlantState(parsed?.state) && Number.isInteger(parsed.revision)
      ? parsed
      : null;
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function initialize() {
  if (
    requireSeparateBackup &&
    path.parse(dataDir).root.toLowerCase() ===
      path.parse(backupDir).root.toLowerCase()
  ) {
    throw new Error(
      "La configuración exige que datos y respaldos estén en unidades distintas.",
    );
  }
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(backupDir, { recursive: true });
  let disk = await readEnvelope(dataFile);
  const names = (await fs.readdir(backupDir))
    .filter((name) => /^planta-r\d+-.*\.json$/i.test(name))
    .sort(
      (a, b) =>
        Number(b.split("-")[1].slice(1)) - Number(a.split("-")[1].slice(1)) ||
        b.localeCompare(a),
    );
  for (const name of names) {
    const file = path.join(backupDir, name);
    const backup = await readEnvelope(file);
    if (!backup) continue;
    if (!disk || backup.revision > disk.revision) {
      disk = {
        ...backup,
        lastBackupAt: backup.lastBackupAt || backup.savedAt || null,
        lastBackupFile: file,
      };
      await replaceFile(dataFile, JSON.stringify(disk, null, 2));
    }
    break;
  }
  if (disk)
    return {
      ...disk,
      lastBackupAt: disk.lastBackupAt || null,
      lastBackupFile: disk.lastBackupFile || null,
      committedMutationIds: Array.isArray(disk.committedMutationIds)
        ? disk.committedMutationIds.slice(-200)
        : [],
    };
  try {
    await fs.access(dataFile);
    throw new Error(
      `El archivo ${dataFile} está dañado y no existe una copia válida.`,
    );
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  if (!isPlantState(seed))
    throw new Error("Los datos de demostración no son válidos.");
  return save(seed, 1, []);
}

type Store = { snapshot?: Promise<PlantSnapshot>; writes: Promise<unknown> };
const processStore = globalThis as typeof globalThis & {
  microEmpaquesStores?: Map<string, Store>;
};
const stores = (processStore.microEmpaquesStores ??= new Map());
const key = JSON.stringify([dataDir, backupDir, requireSeparateBackup]);
const store = stores.get(key) ?? { writes: Promise.resolve() };
stores.set(key, store);

export function getSnapshot() {
  return (store.snapshot ??= initialize().catch((error) => {
    delete store.snapshot;
    throw error;
  }));
}

export function commit(next: PlantState, expected: number, mutationId: string) {
  const operation = store.writes.then(async () => {
    const current = await getSnapshot();
    if (current.committedMutationIds.includes(mutationId))
      return { kind: "duplicate", snapshot: current } as const;
    if (current.revision !== expected)
      return { kind: "conflict", snapshot: current } as const;
    const ids = [...current.committedMutationIds, mutationId].slice(-200);
    const snapshot = await save(next, current.revision + 1, ids);
    store.snapshot = Promise.resolve(snapshot);
    return { kind: "saved", snapshot } as const;
  });
  store.writes = operation.catch(() => undefined);
  return operation;
}
