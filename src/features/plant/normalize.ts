import type { Cell, PlantState } from "@/types/plant";
import {
  createStreams,
  hasProgress,
  upgradeLegacyOrder,
} from "@/features/orders/order-flow";
import { defaultMachines, defaultRoutes } from "./catalog";

export function formatPlantDate(value?: Cell) {
  const text = String(value ?? "").trim();
  if (
    /^\d+(?:\.\d+)?$/.test(text) &&
    Number(text) > 15000 &&
    Number(text) < 100000
  ) {
    const date = new Date(
      Date.UTC(1899, 11, 30) + Math.round(Number(text) * 86400000),
    );
    return date.toISOString().slice(0, 10).split("-").reverse().join("/");
  }
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T)/);
  if (iso)
    return `${iso[3].padStart(2, "0")}/${iso[2].padStart(2, "0")}/${iso[1]}`;
  const local = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (local)
    return `${local[1].padStart(2, "0")}/${local[2].padStart(2, "0")}/${local[3].length === 2 ? "20" : ""}${local[3]}`;
  return text;
}

export function normalizeState(raw: PlantState): PlantState {
  const state = structuredClone(raw);
  const { Cierre, Empaque, ...stored } = state.machines;
  state.machines = { ...defaultMachines, ...stored };
  state.machines.Contada = stored.Contada || Empaque || defaultMachines.Contada;
  state.machines["Impresión"] = state.machines["Impresión"].filter(
    (machine) => !/^Flexográfica/i.test(machine),
  );
  state.machines.Pegadoras = (
    stored.Pegadoras ||
    Cierre ||
    defaultMachines.Pegadoras
  ).filter((machine) => !/^Cierre/i.test(machine));
  const legacyCatalog = !state.routeCatalogVersion && state.routes.length < 10;
  if (legacyCatalog) state.routes = structuredClone(defaultRoutes);
  state.routeCatalogVersion = 1;
  state.operators ??= [];
  delete state.packingRules;
  for (const order of state.orders) {
    for (const key of ["entryDate", "dispatchDate", "dueDate"] as const) {
      if (order[key]) order[key] = formatPlantDate(order[key]);
    }
    if (legacyCatalog && !hasProgress(order)) {
      const index = Math.min(
        state.routes.length - 1,
        Math.max(0, Number(order.route) || 0),
      );
      const route = state.routes[index];
      Object.assign(order, {
        route: index,
        routeName: route.name,
        routeSteps: [...route.steps],
        stage: route.steps[0],
        streams: createStreams(order, route.steps),
        done: 0,
        machine: "",
        status: "Pendiente",
        started: false,
        finished: false,
        operatorCode: "",
      });
    }
    upgradeLegacyOrder(order, state.routes);
  }
  return state;
}
