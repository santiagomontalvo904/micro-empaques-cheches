"use client";

import { Badge, Heading, Panel } from "@/components/ui";
import { OrderDetails } from "@/features/orders/order-details";
import {
  allOperations,
  machineOptions,
  orderKey,
} from "@/features/orders/order-flow";
import { findOrder, usePlant } from "@/features/plant/plant-context";
import { getOperation } from "./workflow";

export function Assignments() {
  const { snapshot, status, save } = usePlant();
  const state = snapshot?.state;
  return (
    <>
      <Heading
        title="Asignación de máquinas"
        description="Programa el equipo previsto para cada operación de la ruta."
      />
      <Panel title="Programación por orden">
        {state?.orders.length ? (
          state.orders.map((order) => {
            const operations = allOperations(order);
            const rows = operations.length
              ? operations
              : [
                  {
                    op: { stage: order.stage, machine: order.machine },
                    group: null,
                    index: 0,
                    lane: "Ruta",
                  },
                ];
            return (
              <article className="assignment-order" key={orderKey(order)}>
                <h3>
                  <OrderDetails order={order} />
                </h3>
                <p className="muted">
                  OC {order.corr}
                  {order.conv && ` · OV ${order.conv}`} · {order.routeName}
                </p>
                {rows.map(({ op, group, index, lane }) => {
                  const options = new Set(
                    machineOptions(op.stage || "", order, state.machines),
                  );
                  if (op.machine) options.add(op.machine);
                  return (
                    <div
                      className="assignrow assignment-row"
                      key={`${group}-${index}`}
                    >
                      <div>
                        <strong>{op.stage}</strong>
                        <small>
                          {lane} · Paso {index + 1}
                        </small>
                      </div>
                      <label className="field">
                        Máquina asignada
                        <select
                          disabled={status !== "online"}
                          value={op.machine ?? ""}
                          onChange={(event) => {
                            const machine = event.target.value;
                            void save((next) => {
                              const updated = findOrder(next, order);
                              if (group)
                                getOperation(updated, group, index).machine =
                                  machine;
                              else updated.machine = machine;
                            });
                          }}
                        >
                          <option value="">Sin asignar</option>
                          {[...options].map((machine) => (
                            <option key={machine}>{machine}</option>
                          ))}
                        </select>
                      </label>
                      <Badge>{op.machine ? "Asignada" : "Pendiente"}</Badge>
                    </div>
                  );
                })}
              </article>
            );
          })
        ) : (
          <p className="muted">No hay órdenes para programar.</p>
        )}
      </Panel>
    </>
  );
}
