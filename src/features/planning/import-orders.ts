import type { Cell, Order, PlantState, WorkbookPreview } from "@/types/plant";
import {
  createStreams,
  hasProgress,
  orderKey,
} from "@/features/orders/order-flow";
import { formatPlantDate } from "@/features/plant/normalize";

export const importFields = [
  [
    "corr",
    "Orden de corrugación (madre)",
    true,
    /orden.*corrug|corrug.*principal/i,
  ],
  ["conv", "Orden de convertidora", false, /orden.*convertidora/i],
  ["customer", "Cliente", false, /cliente/i],
  ["product", "Referencia / producto", true, /referencia|producto|caja/i],
  [
    "corrQty",
    "Cantidad de láminas corrugadas",
    false,
    /l[aá]minas corrugadas/i,
  ],
  [
    "convQty",
    "Cantidad de láminas convertidas",
    false,
    /l[aá]minas convertid/i,
  ],
  [
    "qty",
    "Total cajas meta",
    true,
    /total cajas meta|cantidad total|^cantidad$/i,
  ],
  ["entryDate", "Fecha ingreso", false, /fecha.*ingreso|ingreso/i],
  [
    "dispatchDate",
    "Fecha despacho / objetivo",
    false,
    /fecha.*despacho|despacho|fecha.*entrega/i,
  ],
  ["priority", "Prioridad", false, /prioridad|urgente/i],
  ["cabida", "Cabida", false, /cabida/i],
  ["routeCode", "Ruta del archivo", false, /ruta.*asignada|^ruta$/i],
] as const;

type Field = (typeof importFields)[number][0];
export type Mapping = Partial<Record<Field, number>>;
export type ImportResult = { added: number; updated: number; invalid: number };

export function guessMapping(headers: string[]): Mapping {
  return Object.fromEntries(
    importFields.map(([key, , , pattern]) => [
      key,
      headers.findIndex((header) => pattern.test(header)),
    ]),
  );
}

const text = (value?: Cell) => String(value ?? "").trim();
const quantity = (value?: Cell) => Number(text(value).replace(/\s/g, ""));

export function importOrders(
  state: PlantState,
  preview: WorkbookPreview,
  mapping: Mapping,
  fallbackRoute: number,
): ImportResult {
  if (
    importFields.some(
      ([key, , required]) => required && (mapping[key] ?? -1) < 0,
    )
  )
    throw new Error("Asigna las columnas obligatorias antes de cargar.");
  if (!state.routes[fallbackRoute]?.steps.length)
    throw new Error("Selecciona una ruta válida.");

  const result = { added: 0, updated: 0, invalid: 0 };
  const current = state.orders.filter((order) => !order.isDemo);
  const indexed = new Map(current.map((order) => [orderKey(order), order]));
  const added: Order[] = [];
  for (const row of preview.rows) {
    const read = (key: Field) => row[mapping[key] ?? -1];
    const mapped = (key: Field) => (mapping[key] ?? -1) >= 0;
    const corr = text(read("corr"));
    const conv = text(read("conv"));
    const qty = quantity(read("qty"));
    const product = text(read("product"));
    if (!corr || !product || !Number.isFinite(qty) || qty <= 0) {
      result.invalid++;
      continue;
    }
    const key = JSON.stringify([corr, conv]);
    const previous = indexed.get(key);
    const corrQty =
      (mapped("corrQty") ? quantity(read("corrQty")) : previous?.corrQty) ||
      qty;
    const convQty =
      (mapped("convQty") ? quantity(read("convQty")) : previous?.convQty) || 0;
    const entryDate = formatPlantDate(
      mapped("entryDate") ? read("entryDate") : previous?.entryDate,
    );
    const dispatchDate = formatPlantDate(
      mapped("dispatchDate")
        ? read("dispatchDate")
        : previous?.dispatchDate || previous?.dueDate,
    );
    const routeCell = text(read("routeCode"));
    const code =
      routeCell.match(/(?:ruta|route)\s*([1-9]\d*)/i)?.[1] ??
      routeCell.match(/^([1-9]\d*)(?:\.0+)?$/)?.[1];
    const index = Number(code) - 1;
    const route = state.routes[index]?.steps.length ? index : fallbackRoute;
    const details = {
      corr,
      conv,
      product,
      qty,
      corrQty,
      convQty,
      entryDate,
      dispatchDate,
      dueDate: dispatchDate,
      customer: text(read("customer")) || previous?.customer || "",
      priority:
        (mapped("priority") ? text(read("priority")) : previous?.priority) ||
        "Normal",
      cabida: mapped("cabida") ? text(read("cabida")) : previous?.cabida || "",
      sourceSheet: preview.sheet,
      sourceFile: preview.file,
      sourceHeaders: preview.headers,
      sourceValues: row,
    };
    if (previous) {
      const replaceRoute =
        Boolean(routeCell) &&
        route !== previous.route &&
        !hasProgress(previous);
      Object.assign(previous, details);
      if (replaceRoute) configureRoute(previous, route);
      if (previous.streams?.kind === "parallel") {
        previous.streams.corr.qty = corrQty;
        previous.streams.conv.qty = convQty || qty;
        previous.streams.mergeQty = Math.min(corrQty, convQty || qty, qty);
      } else if (previous.streams?.kind === "linear")
        previous.streams.main.qty = qty;
      result.updated++;
    } else {
      const order: Order = {
        ...details,
        route,
        stage: "",
        done: 0,
        status: "Pendiente",
        history: [],
      };
      configureRoute(order, route);
      indexed.set(key, order);
      added.push(order);
      result.added++;
    }
  }
  if (!result.added && !result.updated)
    throw new Error(
      "No se encontraron filas válidas. Revisa la asignación de columnas y las cantidades.",
    );
  state.orders = [...added.reverse(), ...current];
  state.lastImportAt = new Date().toISOString();
  return result;

  function configureRoute(order: Order, index: number) {
    const route = state.routes[index];
    Object.assign(order, {
      route: index,
      routeName: route.name,
      routeSteps: [...route.steps],
      stage: route.steps[0],
      machine: "",
      streams: createStreams(order, route.steps),
    });
  }
}
