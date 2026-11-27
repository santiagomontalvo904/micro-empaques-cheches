"use client";

import { useState } from "react";
import { Heading, Panel } from "@/components/ui";
import { usePlant } from "@/features/plant/plant-context";
import type { Machines, Operator, PlantState, Route } from "@/types/plant";

type Draft = {
  routes: (Route & { origin: number | null })[];
  machines: Record<string, string>;
  operators: Operator[];
};

function createDraft(state: PlantState): Draft {
  return {
    routes: state.routes.map((route, origin) => ({
      ...route,
      steps: [...route.steps],
      origin,
    })),
    machines: Object.fromEntries(
      Object.entries(state.machines).map(([area, machines]) => [
        area,
        machines.join("\n"),
      ]),
    ),
    operators: structuredClone(state.operators ?? []),
  };
}

export function Settings() {
  const { snapshot, status, save } = usePlant();
  const [edited, setEdited] = useState<{ draft: Draft; base: Draft }>();
  const draft =
    edited?.draft ?? (snapshot ? createDraft(snapshot.state) : undefined);
  if (!draft || !snapshot)
    return (
      <Heading title="Configuración" description="Esperando datos de planta." />
    );
  const base = edited?.base ?? draft;

  function change(edit: (draft: Draft) => void) {
    const next = structuredClone(draft!);
    edit(next);
    setEdited({ draft: next, base });
  }

  async function persist() {
    const confirmed = await save((state) => {
      if (JSON.stringify(base) !== JSON.stringify(createDraft(state)))
        throw new Error(
          "La configuración cambió en el servidor. Descarta el borrador y vuelve a editar.",
        );
      const routes = draft!.routes.map((route) => ({
        name: route.name.trim(),
        steps: route.steps.map((step) => step.trim()),
      }));
      if (
        routes.some(
          (route) =>
            !route.name ||
            !route.steps.length ||
            route.steps.some((step) => !step),
        )
      )
        throw new Error(
          "Completa el nombre y todas las operaciones de cada ruta.",
        );
      const operators = draft!.operators.map((person) => ({
        code: person.code.trim(),
        name: person.name.trim(),
      }));
      if (operators.some((person) => !person.code || !person.name))
        throw new Error("Completa el código y el nombre de cada operario.");
      if (
        new Set(operators.map((person) => person.code.toLowerCase())).size !==
        operators.length
      )
        throw new Error("Cada operario debe tener un código único.");
      const machines: Machines = Object.fromEntries(
        Object.entries(draft!.machines).map(([area, values]) => [
          area,
          [
            ...new Set(
              values
                .split(/\r?\n|,/)
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ],
        ]),
      );
      const indexes = new Map(
        draft!.routes.map(({ origin }, index) => [origin, index]),
      );
      for (const order of state.orders) {
        const current = state.routes[order.route];
        order.routeName ||= current?.name;
        order.routeSteps ??= current?.steps;
        order.route = indexes.get(order.route) ?? -1;
      }
      Object.assign(state, { routes, machines, operators });
    }, "Configuración guardada y confirmada.");
    if (confirmed) setEdited(undefined);
  }

  return (
    <>
      <Heading
        title="Configuración"
        description="Edita las rutas de producción, los equipos de cada área y el catálogo de operarios."
        actions={
          <div className="row">
            {edited && (
              <button
                className="button"
                disabled={status === "saving"}
                onClick={() => setEdited(undefined)}
              >
                Descartar borrador
              </button>
            )}
            <button
              className="button primary"
              disabled={status !== "online" || !edited}
              onClick={() => void persist()}
            >
              Guardar cambios
            </button>
          </div>
        }
      />
      <div className="settings-layout">
        <Panel title="Rutas de producción">
          {draft.routes.map((route, index) => (
            <fieldset key={index} className="route-editor">
              <legend>{route.name || `Ruta ${index + 1}`}</legend>
              <label className="field">
                Nombre
                <input
                  value={route.name}
                  onChange={(event) =>
                    change((next) => {
                      next.routes[index].name = event.target.value;
                    })
                  }
                />
              </label>
              {route.steps.map((step, pos) => (
                <div className="row step-editor" key={pos}>
                  <label className="field">
                    Operación {pos + 1}
                    <input
                      value={step}
                      onChange={(event) =>
                        change((next) => {
                          next.routes[index].steps[pos] = event.target.value;
                        })
                      }
                    />
                  </label>
                  {[-1, 1].map((delta) => (
                    <button
                      className="button small"
                      key={delta}
                      disabled={
                        pos + delta < 0 || pos + delta >= route.steps.length
                      }
                      onClick={() =>
                        change((next) => {
                          const steps = next.routes[index].steps;
                          [steps[pos], steps[pos + delta]] = [
                            steps[pos + delta],
                            steps[pos],
                          ];
                        })
                      }
                    >
                      {delta < 0 ? "Subir" : "Bajar"}
                    </button>
                  ))}
                  <button
                    className="button small"
                    disabled={route.steps.length === 1}
                    onClick={() =>
                      change((next) => {
                        next.routes[index].steps.splice(pos, 1);
                      })
                    }
                  >
                    Quitar
                  </button>
                </div>
              ))}
              <div className="row">
                <button
                  className="button small"
                  onClick={() =>
                    change((next) => {
                      next.routes[index].steps.push("Nueva operación");
                    })
                  }
                >
                  Agregar operación
                </button>
                <button
                  className="button small"
                  disabled={draft.routes.length === 1}
                  onClick={() =>
                    change((next) => {
                      next.routes.splice(index, 1);
                    })
                  }
                >
                  Eliminar ruta
                </button>
              </div>
            </fieldset>
          ))}
          <button
            className="button"
            onClick={() =>
              change((next) => {
                next.routes.push({
                  origin: null,
                  name: "Nueva ruta",
                  steps: ["Operación 1", "Operación 2"],
                });
              })
            }
          >
            Agregar ruta
          </button>
        </Panel>
        <div>
          <Panel title="Máquinas por proceso">
            <p className="muted">Escribe una máquina por línea.</p>
            <div className="settings-fields">
              {Object.entries(draft.machines).map(([area, machines]) => (
                <label className="field" key={area}>
                  {area}
                  <textarea
                    rows={Math.max(2, machines.split("\n").length)}
                    value={machines}
                    onChange={(event) =>
                      change((next) => {
                        next.machines[area] = event.target.value;
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </Panel>
          <Panel title="Operarios">
            {draft.operators.map((operator, index) => (
              <div className="row operator-editor" key={index}>
                <label className="field">
                  Código
                  <input
                    value={operator.code}
                    onChange={(event) =>
                      change((next) => {
                        next.operators[index].code = event.target.value;
                      })
                    }
                  />
                </label>
                <label className="field">
                  Nombre
                  <input
                    value={operator.name}
                    onChange={(event) =>
                      change((next) => {
                        next.operators[index].name = event.target.value;
                      })
                    }
                  />
                </label>
                <button
                  className="button small"
                  onClick={() =>
                    change((next) => {
                      next.operators.splice(index, 1);
                    })
                  }
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              className="button"
              onClick={() =>
                change((next) => {
                  next.operators.push({ code: "", name: "" });
                })
              }
            >
              Agregar operario
            </button>
          </Panel>
        </div>
      </div>
    </>
  );
}
