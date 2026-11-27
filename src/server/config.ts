import path from "node:path";

export const dataDir = path.resolve(
  process.env.DATA_DIR || path.join(process.cwd(), "data"),
);
export const dataFile = path.join(dataDir, "planta.json");
export const backupDir = path.resolve(
  process.env.BACKUP_DIR || path.join(dataDir, "backups"),
);
export const requireSeparateBackup =
  process.env.REQUIRE_SEPARATE_BACKUP === "1";
