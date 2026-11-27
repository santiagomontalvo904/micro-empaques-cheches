"use client";

import { useState, type ReactNode } from "react";
import { Badge, Heading, units } from "@/components/ui";
import { OrderDetails } from "@/features/orders/order-details";
import {
  allOperations,
  machineKey,
  orderKey,
} from "@/features/orders/order-flow";
import { stations, type Station } from "@/features/plant/catalog";
import { findOrder, usePlant } from "@/features/plant/plant-context";
import type { Delivery, Order } from "@/types/plant";
import { WorkCard } from "./work-card";
import {
  recordDelivery,
  sortOrders,
  stationQueue,
  taskStatus,
  type WorkItem,
} from "./workflow";
import { LegacyWorkCard } from "./legacy-work-card";

const columns = ["Pendiente", "Asignada", "En proceso", "Parcial"] as const;

type DeliveredOrder = Order & { delivery: Delivery };

export function KioskToggle() {
  const { kiosk, setKiosk } = usePlant();
  return (
    <button className="button" onClick={() => setKiosk(!kiosk)}>
      {kiosk ? "Salir de modo operario" : "Modo operario"}
    </button>
  );
}

function useStation() {
  const plant = usePlant();
  const { selection, snapshot } = plant;
  const station =
    stations.find((item) => item.id === selection.area) ?? stations[0];
  const machines = [
    ...new Set(
      station.keys.flatMap((key) => snapshot?.state.machines[key] ?? []),
    ),
  ];
  const machine = machines.includes(selection.machine)
    ? selection.machine
    : "*";
  return { ...plant, station, machines, machine };
}

function StationControls({
  station,
  machines,
  machine,
  kiosk,
  select,
}: {
  station: Station;
  machines: string[];
  machine: string;
  kiosk: boolean;
  select: (selection: { area: string; machine: string }) => void;
}) {
  return (
    <div className="station-controls">
      <label className="field">
        Área
        <select
          value={station.id}
          disabled={kiosk}
          onChange={(event) =>
            select({ area: event.target.value, machine: "*" })
          }
        >
          {stations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {!station.delivery && (
        <label className="field">
          Máquina
          <select
            value={machine}
            disabled={kiosk}
            onChange={(event) =>
              select({ area: station.id, machine: event.target.value })
            }
          >
            <option value="*">Todas las máquinas / pendientes</option>
            {machines.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function Metrics({ values }: { values: [string, number][] }) {
  return (
    <div className="station-kpis">
      {values.map(([label, value]) => (
        <div className="station-kpi" key={label}>
          {label}
          <b>{units(value)}</b>
        </div>
      ))}
    </div>
  );
}

function Column({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="station-column">
      <h2>
        {label}
        <span className="station-count">{units(count)}</span>
      </h2>
      {count ? (
        children
      ) : (
        <p className="empty">Sin operaciones en esta cola.</p>
      )}
    </section>
  );
}

function DeliveryCard({ order }: { order: DeliveredOrder }) {
  const { status, save } = usePlant();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const delivery = order.delivery;
  const remaining = Math.max(0, delivery.eligibleQty - delivery.deliveredQty);
  async function record(finalize: boolean) {
    if (
      await save(
        (state) =>
          recordDelivery(
            findOrder(state, order),
            Number(amount),
            note,
            finalize,
          ),
        "Entrega guardada y confirmada.",
      )
    ) {
      setAmount("");
      setNote("");
    }
  }
  return (
    <article className="station-card work-card">
      <OrderDetails order={order} />
      <p>
        OC {order.corr}
        {order.conv && ` · OV ${order.conv}`}
      </p>
      <p>
        Despachado <b>{units(delivery.dispatchedQty)}</b> · Averías{" "}
        <b>{units(delivery.defectsQty)}</b>
      </p>
      <p>
        Entregado <b>{units(delivery.deliveredQty)}</b> de{" "}
        {units(delivery.eligibleQty)} · Saldo {units(remaining)}
      </p>
      <Badge>{delivery.status ?? "Pendiente de entrega"}</Badge>
      {remaining > 0 && (
        <div className="work-form">
          <label className="field">
            Cantidad entregada
            <input
              type="number"
              min={0}
              max={remaining}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="field">
            Observación
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="row">
            <button
              className="button small"
              disabled={status !== "online"}
              onClick={() => void record(false)}
            >
              Registrar entrega parcial
            </button>
            <button
              className="button small primary"
              disabled={status !== "online"}
              onClick={() => void record(true)}
            >
              Confirmar entrega
            </button>
          </div>
        </div>
      )}
      {!!delivery.history?.length && (
        <details>
          <summary>Historial de entregas</summary>
          <ul>
            {delivery.history.map((event, index) => (
              <li key={index}>
                {event.date} · {units(event.qty)} und. {event.note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function DeliveryBoard({ orders }: { orders: Order[] }) {
  const queue = orders
    .filter((order): order is DeliveredOrder => !!order.delivery?.active)
    .sort(sortOrders);
  const total = (key: "eligibleQty" | "deliveredQty" | "defectsQty") =>
    queue.reduce((sum, order) => sum + (order.delivery[key] || 0), 0);
  const eligible = total("eligibleQty");
  const delivered = total("deliveredQty");
  const groups: [string, DeliveredOrder[]][] = [
    [
      "Pendiente de entrega",
      queue.filter(
        ({ delivery }) => !delivery.deliveredQty && delivery.eligibleQty > 0,
      ),
    ],
    [
      "Entrega parcial",
      queue.filter(
        ({ delivery }) =>
          delivery.deliveredQty > 0 &&
          delivery.deliveredQty < delivery.eligibleQty,
      ),
    ],
    [
      "Entregado a cliente",
      queue.filter(
        ({ delivery }) => delivery.deliveredQty >= delivery.eligibleQty,
      ),
    ],
  ];
  return (
    <>
      <Metrics
        values={[
          ["Para entregar", eligible],
          ["Entregado", delivered],
          ["Saldo", Math.max(0, eligible - delivered)],
          ["Averías de despacho", total("defectsQty")],
        ]}
      />
      <div className="station-board delivery-board">
        {groups.map(([label, items]) => (
          <Column key={label} label={label} count={items.length}>
            {items.map((order) => (
              <DeliveryCard key={orderKey(order)} order={order} />
            ))}
          </Column>
        ))}
      </div>
    </>
  );
}

const taskKey = (task: WorkItem) =>
  `${orderKey(task.order)}-${task.group}-${task.index}`;

function ProductionBoard({
  orders,
  station,
  machine,
}: {
  orders: Order[];
  station: Station;
  machine: string;
}) {
  const queue = stationQueue(orders, station, machine).filter(
    (task) => taskStatus(task) !== "Completa",
  );
  const groups = columns.map((label) => ({
    label,
    items: queue.filter((task) => taskStatus(task) === label),
  }));
  const dispatch = orders
    .flatMap(allOperations)
    .filter(
      ({ op }) =>
        machineKey(op.stage) === "Despacho" &&
        (machine === "*" || op.machine === machine),
    );
  const metrics: [string, number][] =
    station.id === "despacho"
      ? [
          [
            "Por despachar",
            queue.reduce((sum, task) => sum + task.remaining, 0),
          ],
          ["Despachado", dispatch.reduce((sum, { op }) => sum + op.passed, 0)],
          [
            "Averías",
            dispatch.reduce((sum, { op }) => sum + (op.defects ?? 0), 0),
          ],
          ["Operaciones en cola", queue.length],
        ]
      : groups.map(({ label, items }) => [label, items.length]);
  return (
    <>
      <Metrics values={metrics} />
      <div className="station-board">
        {groups.map(({ label, items }) => (
          <Column key={label} label={label} count={items.length}>
            {items.map((task) => (
              <WorkCard task={task} key={taskKey(task)} />
            ))}
          </Column>
        ))}
      </div>
    </>
  );
}

export function Stations() {
  const context = useStation();
  const { station, machine, snapshot, notify } = context;
  const orders = snapshot?.state.orders ?? [];
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify("El navegador no habilitó la pantalla completa.");
    }
  }
  return (
    <>
      <Heading
        title={`Tablero · ${station.label}`}
        description="El área y la máquina se guardan en este navegador."
        actions={
          <div className="row">
            <KioskToggle />
            <button className="button" onClick={() => void fullscreen()}>
              Pantalla completa
            </button>
          </div>
        }
      />
      <StationControls {...context} />
      {station.delivery ? (
        <DeliveryBoard orders={orders} />
      ) : (
        <ProductionBoard orders={orders} station={station} machine={machine} />
      )}
    </>
  );
}

export function OperatorView() {
  const context = useStation();
  const { station, machine, snapshot } = context;
  const orders = snapshot?.state.orders ?? [];
  const work = stationQueue(
    orders,
    station,
    machine,
    snapshot?.state.machines,
  ).filter((task) => taskStatus(task) !== "Completa");
  const legacy = orders.filter(
    (order) =>
      !order.streams &&
      order.machine &&
      !order.finished &&
      station.keys.includes(machineKey(order.stage || "")) &&
      (machine === "*" || order.machine === machine),
  );
  return (
    <>
      <Heading
        title="Vista de operario"
        description="Operaciones disponibles en el área seleccionada."
        actions={<KioskToggle />}
      />
      <StationControls {...context} />
      {work.length || legacy.length ? (
        <div className="operator-grid">
          {work.map((task) => (
            <WorkCard
              operator
              machineFilter={machine}
              task={task}
              key={taskKey(task)}
            />
          ))}
          {legacy.map((order) => (
            <LegacyWorkCard order={order} key={orderKey(order)} />
          ))}
        </div>
      ) : (
        <p className="panel empty">
          No hay operaciones disponibles para esta área y máquina.
        </p>
      )}
    </>
  );
}
