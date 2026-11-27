"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { PlantProvider, usePlant } from "@/features/plant/plant-context";

const navigation = [
  { href: "/", label: "Resumen de planta", icon: "▤" },
  { href: "/planeacion", label: "Planeación", icon: "↥" },
  { href: "/asignacion", label: "Asignación de máquinas", icon: "▧" },
  { href: "/operario", label: "Vista de operario", icon: "◷", kiosk: true },
  {
    href: "/estaciones",
    label: "Tablero de estaciones",
    icon: "▥",
    kiosk: true,
  },
  { href: "/configuracion", label: "Configuración", icon: "⚙" },
];

const statusLabels = {
  loading: "Conectando con el servidor de planta…",
  online: "Servidor confirmado",
  saving: "Guardando · pendiente de confirmación…",
  offline: "Servidor de planta desconectado",
  pending: "Cambio pendiente de confirmación",
  conflict: "Conflicto de sincronización",
};

function Shell({ children }: { children: ReactNode }) {
  const { kiosk, snapshot, status, error, message, discardConflict } =
    usePlant();
  const pathname = usePathname();
  const router = useRouter();
  const active = navigation.find((item) => item.href === pathname);
  const restricted = kiosk && Boolean(active && !active.kiosk);
  useEffect(() => {
    if (restricted) router.replace("/estaciones");
  }, [restricted, router]);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandmark" aria-hidden>
            MC
          </div>
          <div>
            <strong>Micro Empaques</strong>
            <small>Cheches · Planta</small>
          </div>
        </div>
        <nav className="nav" aria-label="Secciones de planta">
          {navigation
            .filter((item) => !kiosk || item.kiosk)
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.href === pathname ? "page" : undefined}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            ))}
        </nav>
      </aside>
      <main className="plant-main">
        <div className="topbar">
          <span>{active?.label ?? "Planta"}</span>
          <span className="storage-label" data-kind={status} role="status">
            {statusLabels[status]}
            {snapshot ? ` · revisión ${snapshot.revision}` : ""}
            {status === "online" && snapshot?.lastBackupAt
              ? ` · respaldo ${new Date(snapshot.lastBackupAt).toLocaleString("es-CO")}`
              : ""}
          </span>
        </div>
        <div className="plant-content">
          {error && (
            <div className="banner" role="alert">
              {error}
              {status === "conflict" && (
                <button
                  className="button small"
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Descartar el cambio pendiente de este navegador y cargar la revisión del servidor?",
                      )
                    )
                      void discardConflict();
                  }}
                >
                  Descartar cambio pendiente
                </button>
              )}
            </div>
          )}
          {message && (
            <div className="banner plant-notice" role="status">
              {message}
            </div>
          )}
          {!restricted && children}
        </div>
      </main>
    </div>
  );
}

export function PlantShell({ children }: { children: ReactNode }) {
  return (
    <PlantProvider>
      <Shell>{children}</Shell>
    </PlantProvider>
  );
}
