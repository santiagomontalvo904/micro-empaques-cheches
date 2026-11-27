import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";

async function syncDirectory(directory: string) {
  try {
    const handle = await fs.open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    /* Windows can disallow directory fsync. */
  }
}

async function writeDurable(file: string, bytes: string | Uint8Array) {
  const handle = await fs.open(file, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function replaceFile(
  file: string,
  bytes: string | Uint8Array,
  beforeRename?: () => Promise<void>,
) {
  const temporary = file + "." + process.pid + "." + randomUUID() + ".tmp";
  try {
    await writeDurable(temporary, bytes);
    await beforeRename?.();
    await fs.rename(temporary, file);
    await syncDirectory(path.dirname(file));
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}
