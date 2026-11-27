export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export function json(
  payload: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export function failure(error: unknown, status: number, fallback: string) {
  if (error instanceof RequestError)
    return json({ error: error.message }, error.status);
  if (status >= 500) console.error(error);
  return json(
    {
      error: status < 500 && error instanceof Error ? error.message : fallback,
    },
    status,
  );
}

export async function readBody(request: Request, maxBytes: number) {
  const error = new RequestError("El archivo supera el tamaño permitido.", 413);
  if (Number(request.headers.get("content-length")) > maxBytes) throw error;
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}
