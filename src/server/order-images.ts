import { promises as fs } from "node:fs";
import path from "node:path";
import { backupDir, dataDir } from "./config";
import { replaceFile } from "./durable-file";

export const imageExtensions = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);
const directories = [dataDir, backupDir].map((dir) =>
  path.join(dir, "order-images"),
);

export async function saveImage(
  id: string,
  extension: string,
  bytes: Uint8Array,
) {
  for (const directory of directories) {
    await fs.mkdir(directory, { recursive: true });
    await replaceFile(path.join(directory, id + extension), bytes);
  }
}

export async function loadImage(id: string) {
  for (const [contentType, extension] of imageExtensions) {
    for (const directory of directories) {
      try {
        return {
          contentType,
          bytes: await fs.readFile(path.join(directory, id + extension)),
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  return null;
}
