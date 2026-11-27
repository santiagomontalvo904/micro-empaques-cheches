import { failure, json, readBody } from "@/server/http";
import { workbookPreview } from "@/server/workbook";

export async function POST(request: Request) {
  try {
    const filename = decodeURIComponent(
      request.headers.get("x-file-name") || "ordenes.xlsx",
    ).replace(/[\\/\0]/g, "_");
    if (!/\.(xlsx|csv)$/i.test(filename))
      return json({ error: "Formato no compatible. Usa .xlsx o CSV." }, 415);
    const sheet = decodeURIComponent(request.headers.get("x-sheet-name") || "");
    const bytes = await readBody(request, 15 * 1024 * 1024);
    return json(workbookPreview(bytes, filename, sheet));
  } catch (error) {
    return failure(error, 400, "No se pudo leer el libro.");
  }
}
