"use client";

import { useState } from "react";
import { Badge, units } from "@/components/ui";
import { OrderDetails } from "@/features/orders/order-details";
import { machineKey, machineOptions } from "@/features/orders/order-flow";
import { findOrder, usePlant } from "@/features/plant/plant-context";
import {
  getOperation,
  operatorName,
  recordOperation,
  startOperation,
  taskStatus,
  type WorkAction,
  type WorkItem,
} from "./workflow";

export function WorkCard({
  task,
  operator = false,
  machineFilter = "*",
}: {
  task: WorkItem;
  operator?: boolean;
  machineFilter?: string;
}) {
  const { order, group, index, op, lane, remaining, capacity } = task;
  const { snapshot, status, save } = usePlant();
  const [code, setCode] = useState<string>();
  const [amount, setAmount] = useState("");
  const [defects, setDefects] = useState("");
  const [note, setNote] = useState("");
  const enabled = status === "online";
  const dispatch = machineKey(op.stage) === "Despacho";
  const completed = taskStatus(task) === "Completa";
  const machines = (
    snapshot ? machineOptions(op.stage, order, snapshot.state.machines) : []
  ).filter((machine) => machineFilter === "*" || machine === machineFilter);
  if (op.machine && !machines.includes(op.machine)) machines.push(op.machine);

  function start() {
    void save(
      (state) =>
        startOperation(
          state,
          getOperation(findOrder(state, order), group, index),
          code ?? op.startedBy ?? "",
        ),
      "Inicio guardado y confirmado.",
    );
  }

  async function record(action: WorkAction) {
    const saved = await save(
      (state) =>
        recordOperation(
          state,
          findOrder(state, order),
          group,
          index,
          action,
          Number(amount),
          dispatch ? Number(defects) : 0,
          note,
        ),
      action === "shift"
        ? "Jornada guardada y confirmada."
        : dispatch
          ? "Despacho confirmado. Orden transferida a Entregado a cliente."
          : "Cantidad liberada y confirmada.",
    );
    if (saved) {
      setAmount("");
      setDefects("");
      setNote("");
    }
  }

  return (
    <article
      className={operator ? "oporder work-card" : "station-card work-card"}
    >
      <header>
        <OrderDetails order={order} />
        <Badge>{taskStatus(task)}</Badge>
      </header>
      <p>
        {op.stage} · {lane} · Paso {index + 1}
      </p>
      <p className="muted">
        OC {order.corr}
        {order.conv && ` · OV ${order.conv}`}
      </p>
      {!operator && (
        <p>
          {order.routeName && (
            <>
              <b>{order.routeName}</b> ·{" "}
            </>
          )}
          Ingreso <b>{order.entryDate || "—"}</b> · Meta{" "}
          <b>{units(order.qty)}</b> cajas
          {!!order.corrQty && (
            <>
              {" "}
              · Corrugadas <b>{units(order.corrQty)}</b>
            </>
          )}
          {!!order.convQty && (
            <>
              {" "}
              · Convertidas <b>{units(order.convQty)}</b>
            </>
          )}
        </p>
      )}
      <p>
        Prioridad <b>{order.priority || "Normal"}</b> · Despacho{" "}
        <b>{order.dispatchDate || order.dueDate || "—"}</b>
      </p>
      <p>
        Disponible <b>{units(capacity)}</b> · Registrado{" "}
        <b>{units(op.produced)}</b> · {dispatch ? "Despachado" : "Liberado"}{" "}
        <b>{units(op.passed)}</b>
        {dispatch && (
          <>
            {" "}
            · Averías <b>{units(op.defects ?? 0)}</b>
          </>
        )}
      </p>
      {operator && !completed ? (
        <label className="field">
          Máquina para iniciar
          <select
            disabled={!enabled}
            value={op.machine}
            onChange={(event) => {
              const machine = event.target.value;
              void save((state) => {
                getOperation(findOrder(state, order), group, index).machine =
                  machine;
              });
            }}
          >
            <option value="">Selecciona una máquina</option>
            {machines.map((machine) => (
              <option key={machine}>{machine}</option>
            ))}
          </select>
        </label>
      ) : (
        <p>
          {op.machine ? (
            <>
              Máquina prevista <b>{op.machine}</b>
            </>
          ) : (
            "Máquina por programar en Asignación de máquinas."
          )}
        </p>
      )}
      {!completed && op.machine && (
        <div className="work-form">
          <div className="row work-start">
            <label className="field">
              Código del operario
              <input
                value={code ?? op.startedBy ?? ""}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button
              className="button small"
              disabled={!enabled || !op.machine}
              onClick={start}
            >
              Iniciar
            </button>
          </div>
          <div className="form-grid work-inputs">
            <label className="field">
              {dispatch ? "Cantidad despachada" : "Cantidad de hoy"}
              <input
                type="number"
                min={0}
                max={remaining}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0"
              />
            </label>
            {dispatch && (
              <label className="field">
                Averías
                <input
                  type="number"
                  min={0}
                  max={remaining}
                  value={defects}
                  onChange={(event) => setDefects(event.target.value)}
                  placeholder="0"
                />
              </label>
            )}
            <label className="field">
              Observación breve
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
          <div className="row">
            <button
              className="button small"
              disabled={!enabled || !op.started || !op.startedBy}
              onClick={() => void record("shift")}
            >
              Cerrar jornada
            </button>
            {!dispatch && (
              <button
                className="button small"
                disabled={!enabled || !op.started || !op.startedBy}
                onClick={() => void record("release")}
              >
                Liberar cantidad parcial
              </button>
            )}
            <button
              className="button small primary"
              disabled={!enabled || !op.started || !op.startedBy}
              onClick={() => void record("finish")}
            >
              {dispatch ? "Finalizar despacho" : "Finalizar operación"}
            </button>
          </div>
        </div>
      )}
      {!!op.history?.length && (
        <details className="work-history">
          <summary>Historial de jornada ({op.history.length})</summary>
          <ul>
            {op.history.map((entry, i) => (
              <li key={i}>
                {entry.date} · {entry.event ?? `${units(entry.qty)} und.`}
                {entry.operatorCode && (
                  <>
                    {" "}
                    ·{" "}
                    {(snapshot &&
                      operatorName(snapshot.state, entry.operatorCode)) ||
                      entry.operatorName ||
                      "Operario"}{" "}
                    · código {entry.operatorCode}
                  </>
                )}
                {!!entry.defects && <> · {units(entry.defects)} averías</>}
                {entry.note && <> · {entry.note}</>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
