import { backupDir, dataFile } from "@/server/config";
import { failure, json } from "@/server/http";
import { getSnapshot } from "@/server/plant-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { revision, lastBackupAt, lastBackupFile } = await getSnapshot();
    return json({
      ok: true,
      application: "nextjs",
      revision,
      dataFile,
      backupDir,
      lastBackupAt,
      lastBackupFile,
    });
  } catch (error) {
    return failure(
      error,
      500,
      "El almacenamiento de planta no está disponible.",
    );
  }
}
