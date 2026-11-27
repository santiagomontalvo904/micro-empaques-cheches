import { failure, json, readBody } from "@/server/http";
import { commit, getSnapshot, isPlantState } from "@/server/plant-repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getSnapshot();
    return json(snapshot, 200, { ETag: `"${snapshot.revision}"` });
  } catch (error) {
    return failure(error, 500, "No se pudo leer el estado de la planta.");
  }
}

export async function PUT(request: Request) {
  const expected = Number(request.headers.get("if-match")?.replaceAll('"', ""));
  const id = request.headers.get("x-request-id")?.trim();
  if (!id || id.length > 120)
    return json(
      { error: "Falta el identificador idempotente de la escritura." },
      400,
    );
  let state: unknown;
  try {
    state = JSON.parse(
      (await readBody(request, 4 * 1024 * 1024)).toString("utf8"),
    );
  } catch (error) {
    return failure(error, 400, "JSON no válido.");
  }
  if (!isPlantState(state))
    return json({ error: "La estructura de datos no es válida." }, 400);
  try {
    const { kind, snapshot } = await commit(state, expected, id);
    const { revision, lastBackupAt, lastBackupFile } = snapshot;
    if (kind === "conflict")
      return json(
        { revision, error: "Los datos cambiaron en otra sesión." },
        409,
      );
    const duplicate = kind === "duplicate";
    return json(
      {
        ok: true,
        duplicate,
        revision,
        lastBackupAt,
        lastBackupFile,
        state: duplicate ? snapshot.state : undefined,
      },
      200,
      { ETag: `"${revision}"` },
    );
  } catch (error) {
    return failure(error, 500, "No se pudo guardar en disco.");
  }
}
