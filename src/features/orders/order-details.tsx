"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { units } from "@/components/ui";
import type { Cell, Order } from "@/types/plant";
import { createMutationId } from "@/features/plant/journal";
import { findOrder, usePlant } from "@/features/plant/plant-context";
import { allOperations } from "./order-flow";

export function OrderDetails({
  order,
  children,
}: {
  order: Order;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="order-open"
        onClick={() => setOpen(true)}
      >
        {children ??
          [order.customer || "Sin cliente", order.product].join(" · ")}
      </button>
      {open && <OrderDialog order={order} onClose={() => setOpen(false)} />}
    </>
  );
}

function OrderDialog({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const { snapshot } = usePlant();
  const fields = (order.sourceHeaders ?? [])
    .map((header, index) => ({
      header,
      value: order.sourceValues?.[index] ?? "",
    }))
    .filter(({ value }) => String(value).trim());
  const matching = (pattern: RegExp) =>
    fields.find(({ header }) => pattern.test(header))?.value;
  const cabida = String(order.cabida || matching(/cabida/i) || "");
  const factor = Number(
    cabida.match(/([124])\s*x/i)?.[1] ??
      (/^[124]$/.test(cabida.trim()) ? cabida.trim() : 0),
  );
  const corr = order.corrQty ?? 0;
  const conv = order.convQty ?? 0;
  const metrics: [string, Cell | undefined][] = [
    ["OC Corrugación", order.corr],
    ["OC Convertidora", order.conv],
    ["Cliente", order.customer],
    ["Referencia", order.product],
    ["Ruta", order.routeName || snapshot?.state.routes[order.route]?.name],
    ["Fecha ingreso", order.entryDate],
    ["Fecha despacho", order.dispatchDate || order.dueDate],
    ["Prioridad", order.priority],
    ["Clave", matching(/clave|código|codigo/i)],
    ["Ancho del rollo", matching(/ancho.*rollo/i)],
    ["Ancho corrugado", matching(/ancho.*corrug/i)],
    ["Largo corrugado", matching(/largo.*corrug|longitud.*corrug/i)],
    ["Tipo de flauta", matching(/flauta|onda/i)],
    [
      "Gramajes",
      fields
        .filter(({ header }) => /gramaje|gramos por|g\/m/i.test(header))
        .map(({ header, value }) => `${header}: ${value}`)
        .join(" · "),
    ],
    ["Cabida", cabida],
    ["Láminas corrugadas", units(corr)],
    ["Láminas convertidas", units(conv)],
    ["Meta de cajas", units(order.qty)],
  ];
  const assignments = allOperations(order).filter(({ op }) => op.machine);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="order-ficha"
      aria-label={`Ficha técnica de ${order.corr}`}
    >
      <div className="order-ficha-head">
        <strong>
          Ficha técnica · {order.corr}
          {order.conv && ` / ${order.conv}`}
        </strong>
        <form method="dialog">
          <button className="button small">Cerrar</button>
        </form>
      </div>
      <div className="order-ficha-body">
        <div className="tech-grid">
          {metrics.map(([label, value]) => (
            <div key={label} className="tech-item">
              {label}
              <b>{value ?? "—"}</b>
            </div>
          ))}
        </div>
        {factor > 0 && (
          <p className="banner">
            Salida teórica con cabida {cabida} · Corrugación{" "}
            {units(corr * factor)} piezas · Convertidora {units(conv * factor)}{" "}
            piezas.
          </p>
        )}
        {order.technicalImageId && (
          <>
            <h3>Plano / arte · {order.technicalImageName || "Adjunto"}</h3>
            <img
              className="technical-image"
              src={`/api/order-images/${encodeURIComponent(order.technicalImageId)}`}
              alt={`Plano de ${order.product}`}
              loading="lazy"
            />
          </>
        )}
        <h3>Máquinas asignadas</h3>
        {assignments.length ? (
          <ul>
            {assignments.map(({ group, index, op }) => (
              <li key={`${group}-${index}`}>
                {op.stage} · {op.machine}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Aún no hay máquinas asignadas.</p>
        )}
        <h3>
          Fila original · {order.sourceSheet || "Orden sin archivo asociado"}
        </h3>
        {fields.length > 0 && (
          <div className="tablewrap">
            <table className="tech-table">
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {fields.map(({ header, value }, index) => (
                  <tr key={index}>
                    <td>{header}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </dialog>
  );
}

export function OrderImageUpload({ order }: { order: Order }) {
  const { status, save, notify } = usePlant();
  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      notify("Usa una imagen PNG, JPG o WEBP de máximo 10 MB.");
      return;
    }
    const id = createMutationId();
    notify("Subiendo plano / arte…");
    try {
      const response = await fetch(`/api/order-images/${id}`, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
        },
      });
      if (!response.ok) throw new Error("No se pudo subir el adjunto.");
      const meta = (await response.json()) as { name: string };
      await save(
        (state) =>
          Object.assign(findOrder(state, order), {
            technicalImageId: id,
            technicalImageName: meta.name,
            technicalImageType: file.type,
          }),
        "Plano guardado y confirmado para la orden.",
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudo adjuntar la imagen.",
      );
    }
  }
  return (
    <label className="field">
      Adjuntar plano o arte
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={status !== "online"}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void upload(file);
        }}
      />
    </label>
  );
}
