"use client";

import Link from "next/link";
import { Badge, Heading, Panel, RouteSteps, units } from "@/components/ui";
import { usePlant } from "@/features/plant/plant-context";
import {
  allOperations,
  capacity,
  orderKey,
  orderProgress,
  orderStatus,
} from "./order-flow";
import { OrderDetails } from "./order-details";
import { operatorName } from "@/features/production/workflow";

export function Overview() {
  const { snapshot } = usePlant();
  const state = snapshot?.state;
  const orders = state?.orders ?? [];
  const statistics: [string, number][] = [
    [
      "Órdenes activas",
      orders.filter((order) => orderStatus(order) !== "Completada").length,
    ],
    [
      "En proceso",
      orders.filter(
        (order) =>
          (order.started && !order.streams) ||
          allOperations(order).some(({ op }) => op.started),
      ).length,
    ],
    [
      "Avances parciales",
      orders.filter((order) =>
        allOperations(order).some(({ op }) => op.produced > op.passed),
      ).length,
    ],
    [
      "Listas para avanzar",
      orders.filter((order) =>
        allOperations(order).some(
          ({ group, index, op }) =>
            (index > 0 || group === "shared") &&
            capacity(order, group, index) > op.passed,
        ),
      ).length,
    ],
  ];
  const activity = orders
    .flatMap((order) =>
      [
        ...(order.streams
          ? allOperations(order).flatMap(({ op }) => op.history ?? [])
          : (order.history ?? [])),
        ...(order.delivery?.history ?? []),
      ].map((event) => ({ order, event })),
    )
    .slice(-6)
    .reverse();
  return (
    <>
      <Heading
        title="Resumen de planta"
        description="Seguimiento de órdenes y avance por operación."
        actions={
          <Link className="button" href="/planeacion">
            Nueva planeación
          </Link>
        }
      />
      {orders.some((order) => order.isDemo) && (
        <div className="banner">
          La primera importación válida reemplaza las órdenes de demostración.
        </div>
      )}
      <div className="stats">
        {statistics.map(([label, value]) => (
          <div className="stat" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{units(value)}</div>
          </div>
        ))}
      </div>
      <Panel title="Órdenes de producción">
        {orders.length ? (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente / referencia</th>
                  <th>Ruta</th>
                  <th>Avance</th>
                  <th>Entrega prevista</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const { done, qty } = orderProgress(order);
                  return (
                    <tr key={orderKey(order)}>
                      <td>
                        <OrderDetails order={order} />
                        <div className="muted">
                          OC {order.corr}
                          {order.conv && ` · OV ${order.conv}`}
                        </div>
                      </td>
                      <td>{order.routeName}</td>
                      <td>
                        {units(done)} / {units(qty)}
                      </td>
                      <td>{order.dispatchDate || order.dueDate || "—"}</td>
                      <td>
                        <Badge>{orderStatus(order)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            {state ? "No hay órdenes cargadas." : "Esperando datos de planta."}
          </p>
        )}
      </Panel>
      <Panel title="Actividad reciente">
        {activity.length ? (
          activity.map(({ order, event }, index) => (
            <div className="oprow" key={index}>
              <div className="optext">
                <strong>
                  {order.product} · {event.stage || "Entrega"}
                </strong>
                <small>
                  OC {order.corr} · {event.date}
                  {event.operatorCode &&
                    ` · ${(state && operatorName(state, event.operatorCode)) || event.operatorName || "Operario"} · ${event.operatorCode}`}
                  {event.note && ` · ${event.note}`}
                </small>
              </div>
              <strong>{units(event.qty)} und.</strong>
            </div>
          ))
        ) : (
          <p className="muted">Sin actividad registrada.</p>
        )}
      </Panel>
      <Panel title="Rutas de producción">
        {state?.routes.map((route, index) => (
          <div className="rule route-summary" key={index}>
            <strong>{route.name}</strong>
            <RouteSteps steps={route.steps} />
          </div>
        ))}
      </Panel>
    </>
  );
}
