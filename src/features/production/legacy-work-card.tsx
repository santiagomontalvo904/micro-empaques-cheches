"use client";

import { useState } from "react";
import { OrderDetails } from "@/features/orders/order-details";
import { findOrder, usePlant } from "@/features/plant/plant-context";
import type { Order } from "@/types/plant";
import { operatorName, recordLegacy } from "./workflow";

export function LegacyWorkCard({ order }: { order: Order }) {
  const { status, save } = usePlant();
  const [code, setCode] = useState<string>();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const enabled = status === "online";
  function start() {
    void save((state) => {
      const operatorCode = (code ?? order.operatorCode ?? "").trim();
      if (!operatorCode)
        throw new Error("Ingresa tu código de operario antes de iniciar.");
      const current = findOrder(state, order);
      Object.assign(current, {
        operatorCode,
        started: true,
        status: "En proceso",
      });
      (current.history ??= []).push({
        qty: 0,
        note: "",
        event: "Inicio",
        stage: order.stage,
        date: new Date().toLocaleDateString("es-CO"),
        operatorCode,
        operatorName: operatorName(state, operatorCode),
      });
    });
  }
  async function record(finish: boolean) {
    if (
      await save((state) =>
        recordLegacy(
          state,
          findOrder(state, order),
          Number(amount),
          note,
          finish,
        ),
      )
    ) {
      setAmount("");
      setNote("");
    }
  }
  return (
    <article className="oporder work-card">
      <OrderDetails order={order} />
      <p>
        {order.stage} · {order.machine}
      </p>
      <p>Acumulado {order.done ?? 0}</p>
      <div className="work-form">
        <div className="row work-start">
          <label className="field">
            Código del operario
            <input
              value={code ?? order.operatorCode ?? ""}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button className="button small" disabled={!enabled} onClick={start}>
            Iniciar
          </button>
        </div>
        <label className="field">
          Cantidad de hoy
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="field">
          Observación breve
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <div className="row">
          <button
            className="button small"
            disabled={!enabled || !order.started}
            onClick={() => void record(false)}
          >
            Cerrar jornada
          </button>
          <button
            className="button small primary"
            disabled={!enabled || !order.started}
            onClick={() => void record(true)}
          >
            Finalizar y avanzar
          </button>
        </div>
      </div>
    </article>
  );
}
