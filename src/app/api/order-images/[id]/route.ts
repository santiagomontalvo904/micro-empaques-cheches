import { failure, json, readBody } from "@/server/http";
import { loadImage, saveImage, imageExtensions } from "@/server/order-images";

type Context = { params: Promise<{ id: string }> };
const validId = /^[0-9a-f-]{36}$/i;

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!validId.test(id))
    return json({ error: "No se encontró el adjunto." }, 404);
  try {
    const image = await loadImage(id.toLowerCase());
    if (!image) return json({ error: "No se encontró el adjunto." }, 404);
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error, 500, "No se pudo leer el adjunto.");
  }
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  if (!validId.test(id))
    return json({ error: "Identificador de adjunto inválido." }, 404);
  const contentType = (request.headers.get("content-type") || "")
    .split(";")[0]
    .toLowerCase();
  const extension = imageExtensions.get(contentType);
  if (!extension)
    return json({ error: "Usa una imagen PNG, JPG o WEBP." }, 415);
  try {
    const bytes = await readBody(request, 10 * 1024 * 1024);
    if (!bytes.length) return json({ error: "El archivo está vacío." }, 400);
    let name: string;
    try {
      name = decodeURIComponent(request.headers.get("x-file-name") || "")
        .replace(/[\\/\0]/g, "_")
        .slice(0, 180);
    } catch {
      return json({ error: "Nombre de archivo inválido." }, 400);
    }
    await saveImage(id.toLowerCase(), extension, bytes);
    return json(
      {
        ok: true,
        id: id.toLowerCase(),
        name: name || "plano" + extension,
        contentType,
      },
      201,
    );
  } catch (error) {
    return failure(error, 500, "No se pudo guardar el adjunto.");
  }
}
