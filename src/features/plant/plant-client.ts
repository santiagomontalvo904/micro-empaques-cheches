import type { PlantSnapshot, PlantState } from "@/types/plant";
import {
  createMutationId,
  listChanges,
  openJournal,
  readLocal,
  writeChange,
  writeLocal,
  type PendingChange,
} from "./journal";
import { normalizeState } from "./normalize";

export type SyncStatus =
  "loading" | "online" | "saving" | "offline" | "pending" | "conflict";
export type PlantView = {
  snapshot?: PlantSnapshot;
  status: SyncStatus;
  error?: string;
};

type SaveReply = Pick<
  PlantSnapshot,
  "revision" | "lastBackupAt" | "lastBackupFile"
> & { state?: PlantState; error?: string };
const fallbackKey = "mc_pending_snapshot";
const revisionKey = "mc_server_revision";
const cacheKey = "mc_confirmed_state";

export class PlantClient {
  private view: PlantView = { status: "loading" };
  private db?: IDBDatabase;
  private timer?: ReturnType<typeof setInterval>;
  private pending: PendingChange[] = [];
  private busy = false;
  private disposed = false;
  private polling = false;
  private version = 0;

  constructor(private readonly publish: (view: PlantView) => void) {}

  private update(view: PlantView) {
    this.view = view;
    if (!this.disposed) this.publish(view);
  }

  async start() {
    const cached = readLocal<PlantSnapshot | null>(cacheKey, null);
    if (cached) this.update({ status: "loading", snapshot: cached });
    try {
      this.db = await openJournal();
      if (this.disposed) {
        this.db.close();
        return;
      }
      this.pending = (await listChanges(this.db)).filter(
        (entry) => entry.state?.orders && entry.state?.routes,
      );
      await writeChange(this.db, { id: "__strict_probe__" }, true);
    } catch {
      this.db?.close();
      this.db = undefined;
    }
    if (this.disposed) return;
    const fallback = readLocal<PendingChange | null>(fallbackKey, null);
    if (
      fallback?.state?.orders &&
      fallback.state?.routes &&
      !this.pending.some((change) => change.id === fallback.id)
    )
      this.pending.push(fallback);
    this.pending.sort((a, b) => a.storedAt - b.storedAt);
    const base = readLocal<number | null>(revisionKey, null);
    if (this.pending[0] && this.pending[0].revision == null && base)
      this.pending[0].revision = base;
    this.timer = setInterval(() => void this.refresh(), 5000);
    await this.refresh();
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    this.db?.close();
  }

  private accept(snapshot: PlantSnapshot) {
    const normalized = { ...snapshot, state: normalizeState(snapshot.state) };
    writeLocal(cacheKey, normalized);
    writeLocal(revisionKey, normalized.revision);
    this.update({
      status: this.pending.length ? "saving" : "online",
      snapshot: normalized,
    });
  }

  private async remove(change: PendingChange, requireDurableRemoval = false) {
    if (this.db) {
      try {
        await writeChange(this.db, change, true);
      } catch (error) {
        if (requireDurableRemoval) throw error;
      }
    }
    this.pending = this.pending.filter((entry) => entry.id !== change.id);
    if (readLocal<PendingChange | null>(fallbackKey, null)?.id === change.id)
      writeLocal(fallbackKey, null);
    if (!this.pending.length) {
      writeLocal("mc_sync_conflict", null);
      writeLocal("mc_pending_sync", null);
      writeLocal("mc_pending_releases", null);
      writeLocal("mc_pending_deliveries", null);
    }
  }

  private async flush() {
    for (const change of this.pending) {
      const current = this.view.snapshot!;
      if (change.revision != null && change.revision !== current.revision) {
        this.update({
          snapshot: current,
          status: "conflict",
          error:
            "Hay un cambio pendiente de otra revisión. Se conserva en este navegador.",
        });
        return false;
      }
      const response = await fetch("/api/state", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": String(current.revision),
          "X-Request-Id": change.id,
        },
        body: JSON.stringify(change.state),
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 409) {
        this.update({
          snapshot: current,
          status: "conflict",
          error:
            "Otra terminal actualizó la planta. El cambio sigue pendiente en este navegador.",
        });
        return false;
      }
      if (response.status >= 400 && response.status < 500) {
        const reply = (await response.json()) as SaveReply;
        await this.remove(change);
        this.update({
          snapshot: current,
          status: this.pending.length ? "pending" : "online",
          error: reply.error || "El servidor rechazó el cambio.",
        });
        return false;
      }
      if (!response.ok)
        throw new Error("El servidor aún no confirmó el cambio.");
      const reply = (await response.json()) as SaveReply;
      await this.remove(change);
      this.accept({
        ...current,
        ...reply,
        state: reply.state ?? change.state,
        committedMutationIds: [
          ...current.committedMutationIds,
          change.id,
        ].slice(-200),
      });
    }
    return true;
  }

  private async refresh() {
    if (this.busy || this.polling || this.disposed) return;
    this.polling = true;
    const version = this.version;
    let ownsWriteLock = false;
    try {
      const response = await fetch("/api/state", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("No responde el servidor de planta.");
      const snapshot = (await response.json()) as PlantSnapshot;
      if (this.disposed || this.busy || this.version !== version) return;
      this.busy = ownsWriteLock = true;
      const committed = new Set(snapshot.committedMutationIds);
      const acknowledged = this.pending.filter((change) =>
        committed.has(change.id),
      );
      for (const change of acknowledged) await this.remove(change);
      const next = this.pending[0];
      if (
        next &&
        acknowledged.length &&
        next.revision == null &&
        snapshot.committedMutationIds.at(-1) === acknowledged.at(-1)?.id
      ) {
        next.revision = snapshot.revision;
      }
      if (next && next.revision == null)
        next.revision =
          readLocal<number | null>(revisionKey, null) ?? snapshot.revision;
      if (
        this.view.snapshot?.revision !== snapshot.revision ||
        this.view.status !== "online" ||
        this.pending.length
      )
        this.accept(snapshot);
      if (this.pending.length) await this.flush();
    } catch {
      if (!this.disposed && version === this.version)
        this.update({
          snapshot: this.view.snapshot,
          status: this.pending.length ? "pending" : "offline",
        });
    } finally {
      this.polling = false;
      if (ownsWriteLock) this.busy = false;
    }
  }

  async save(change: (state: PlantState) => void) {
    const snapshot = this.view.snapshot;
    if (!snapshot || this.view.status !== "online" || this.disposed)
      throw new Error(
        "Espera la conexión y la confirmación de los cambios pendientes.",
      );
    if (this.busy) throw new Error("Hay un cambio pendiente de confirmación.");
    const state = structuredClone(snapshot.state);
    change(state);
    const record: PendingChange = {
      id: createMutationId(),
      state,
      revision: snapshot.revision,
      storedAt: Date.now(),
    };
    this.busy = true;
    this.version++;
    this.update({ snapshot, status: "saving" });
    let durable = false;
    try {
      if (this.db) {
        await writeChange(this.db, record);
        durable = true;
        writeLocal(fallbackKey, record);
      }
      this.pending.push(record);
      const saved = await this.flush();
      if (!saved && !durable && this.pending.includes(record)) {
        const error = this.view.error;
        await this.remove(record);
        this.update({ snapshot, status: "offline", error });
      }
      return saved;
    } catch {
      if (!durable) await this.remove(record);
      this.update({
        snapshot,
        status: durable ? "pending" : "offline",
        error: durable
          ? "El cambio está en la cola local y se volverá a intentar."
          : "No se confirmó el cambio. Verifica la conexión antes de repetirlo.",
      });
      return false;
    } finally {
      this.busy = false;
    }
  }

  async discardConflict() {
    if (this.busy || this.view.status !== "conflict") return;
    this.busy = true;
    this.version++;
    try {
      for (const change of this.pending) await this.remove(change, true);
      this.update({ snapshot: this.view.snapshot, status: "loading" });
    } finally {
      this.busy = false;
    }
    await this.refresh();
  }
}
