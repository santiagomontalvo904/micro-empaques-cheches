import type { PlantState } from "@/types/plant";

export type PendingChange = {
  id: string;
  state: PlantState;
  storedAt: number;
  revision?: number;
};

export function readLocal<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Browser preferences can be unavailable. */
  }
}

export function createMutationId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function openJournal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("micro-empaques-journal", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("pending", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("La cola local está bloqueada."));
  });
}

export function listChanges(db: IDBDatabase): Promise<PendingChange[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction("pending").objectStore("pending").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function writeChange(
  db: IDBDatabase,
  change: { id: string } | PendingChange,
  remove = false,
) {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("pending", "readwrite", {
      durability: "strict",
    });
    if (transaction.durability !== "strict") {
      transaction.abort();
      reject(new Error("IndexedDB no ofrece durabilidad estricta."));
      return;
    }
    const store = transaction.objectStore("pending");
    if (remove) store.delete(change.id);
    else store.put(change);
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error);
  });
}
