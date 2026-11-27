import type {
  Group,
  Operation,
  Order,
  PlantState,
  ProductionEvent,
  Task,
} from "@/types/plant";
import {
  allOperations,
  capacity,
  machineKey,
  machineOptions,
} from "@/features/orders/order-flow";
import type { Station } from "@/features/plant/catalog";
import { formatPlantDate } from "@/features/plant/normalize";

export type WorkItem = Task & {
  order: Order;
  capacity: number;
  remaining: number;
};
const priority = (order: Order) =>
  order.priority?.toLowerCase() === "urgente"
    ? 0
    : order.priority?.toLowerCase() === "alta"
      ? 1
      : 2;
const dateKey = (order: Order) => {
  const date = formatPlantDate(order.dispatchDate || order.dueDate);
  if (!date) return Infinity;
  const parts = date.split("/").reverse().join("-");
  const timestamp = Date.parse(parts);
  return Number.isNaN(timestamp) ? Infinity : timestamp;
};

export function sortOrders(a: Order, b: Order) {
  return (
    priority(a) - priority(b) ||
    dateKey(a) - dateKey(b) ||
    String(a.corr).localeCompare(String(b.corr))
  );
}

export function stationQueue(
  orders: Order[],
  station: Station,
  machine: string,
  operatorMachines?: PlantState["machines"],
): WorkItem[] {
  return orders
    .flatMap((order) =>
      allOperations(order).flatMap((task) => {
        const { op } = task;
        if (!station.keys.includes(machineKey(op.stage))) return [];
        if (machine !== "*") {
          if (op.machine && op.machine !== machine) return [];
          if (
            !op.machine &&
            operatorMachines &&
            !machineOptions(op.stage, order, operatorMachines).includes(machine)
          )
            return [];
        }
        const available = capacity(order, task.group, task.index);
        if (!available) return [];
        return [
          {
            ...task,
            order,
            capacity: available,
            remaining: Math.max(0, available - op.produced),
          },
        ];
      }),
    )
    .sort((a, b) => sortOrders(a.order, b.order));
}

export function taskStatus(task: WorkItem) {
  const { op } = task;
  if (
    op.status === "Completa" &&
    !op.started &&
    task.remaining === 0 &&
    (machineKey(op.stage) === "Despacho"
      ? task.order.delivery?.active
      : op.passed >= task.capacity)
  )
    return "Completa";
  if (!op.machine) return "Pendiente";
  if (op.produced > 0) return "Parcial";
  return op.started ? "En proceso" : "Asignada";
}

export function getOperation(order: Order, group: Group, index: number) {
  const op = allOperations(order).find(
    (task) => task.group === group && task.index === index,
  )?.op;
  if (!op) throw new Error("La operación ya no está disponible.");
  return op;
}

export function operatorName(state: PlantState, code?: string) {
  return code
    ? (state.operators?.find(
        (person) => person.code.toLowerCase() === code.toLowerCase(),
      )?.name ?? "")
    : "";
}

const eventDate = () => new Date().toLocaleDateString("es-CO");

function addEvent(op: Operation, event: ProductionEvent) {
  (op.history ??= []).push(event);
}

export function startOperation(
  state: PlantState,
  op: Operation,
  input: string,
) {
  const code = input.trim();
  if (!op.machine)
    throw new Error("Selecciona la máquina donde realizarás esta operación.");
  if (!code) throw new Error("Ingresa tu código de operario antes de iniciar.");
  if (op.started && op.startedBy === code) return;
  Object.assign(op, { startedBy: code, started: true, status: "En proceso" });
  addEvent(op, {
    date: eventDate(),
    stage: op.stage,
    event: "Inicio",
    qty: 0,
    note: "",
    operatorCode: code,
    operatorName: operatorName(state, code),
  });
}

export type WorkAction = "shift" | "release" | "finish";

export function recordOperation(
  state: PlantState,
  order: Order,
  group: Group,
  index: number,
  action: WorkAction,
  amount: number,
  defects: number,
  note: string,
) {
  const op = getOperation(order, group, index);
  const cap = capacity(order, group, index);
  const dispatch = machineKey(op.stage) === "Despacho";
  const remaining = Math.max(0, cap - op.produced);
  if (!op.machine || !op.started || !op.startedBy)
    throw new Error("Primero inicia la operación con tu código de operario.");
  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(defects) ||
    amount < 0 ||
    defects < 0 ||
    amount + defects > remaining
  )
    throw new Error(
      `Puedes registrar hasta ${remaining.toLocaleString("es-CO")} unidades disponibles.`,
    );
  if (action === "finish" && amount + defects < remaining)
    throw new Error(
      `Faltan ${(remaining - amount - defects).toLocaleString("es-CO")} unidades para finalizar.`,
    );
  op.produced += amount + defects;
  if (dispatch) {
    op.passed += amount;
    op.defects = (op.defects ?? 0) + defects;
  } else if (action !== "shift") op.passed = op.produced;
  if (amount || note || defects)
    addEvent(op, {
      date: eventDate(),
      stage: op.stage,
      qty: amount,
      defects,
      note,
      operatorCode: op.startedBy,
      operatorName: operatorName(state, op.startedBy),
    });
  op.status =
    op.produced >= cap ? "Completa" : op.produced ? "Parcial" : "Pendiente";
  op.started = action === "shift";
  if (dispatch && action === "finish") {
    const deliveredQty = order.delivery?.deliveredQty ?? 0;
    order.delivery = {
      active: true,
      dispatchedQty: op.passed,
      defectsQty: op.defects ?? 0,
      eligibleQty: op.passed,
      deliveredQty,
      history: order.delivery?.history ?? [],
      status: deliveredQty >= op.passed ? "Entregado" : "Pendiente de entrega",
    };
  }
}

export function recordDelivery(
  order: Order,
  amount: number,
  note: string,
  finalize: boolean,
) {
  const delivery = order.delivery;
  if (!delivery?.active)
    throw new Error("La orden aún no está habilitada para entrega.");
  const remaining = Math.max(0, delivery.eligibleQty - delivery.deliveredQty);
  if (!Number.isFinite(amount) || amount < 0 || amount > remaining)
    throw new Error(
      `Puedes registrar hasta ${remaining} unidades pendientes de entrega.`,
    );
  if (finalize && amount < remaining)
    throw new Error(`Faltan ${remaining - amount} unidades para finalizar.`);
  delivery.deliveredQty += amount;
  if (amount || note)
    (delivery.history ??= []).push({ date: eventDate(), qty: amount, note });
  delivery.status =
    delivery.deliveredQty >= delivery.eligibleQty
      ? "Entregado"
      : delivery.deliveredQty
        ? "Entrega parcial"
        : "Pendiente de entrega";
}

export function recordLegacy(
  state: PlantState,
  order: Order,
  amount: number,
  note: string,
  finish: boolean,
) {
  if (!order.operatorCode || !order.started)
    throw new Error("Primero inicia la operación con tu código de operario.");
  const quantity =
    machineKey(order.stage) === "Corrugador"
      ? order.corrQty || order.qty
      : machineKey(order.stage) === "Convertidora"
        ? order.convQty || order.qty
        : order.qty;
  const limit =
    machineKey(order.stage) === "Convertidora"
      ? quantity
      : Math.min(quantity, order.availableQty || quantity);
  const remaining = Math.max(0, limit - (order.done ?? 0));
  if (!Number.isFinite(amount) || amount < 0 || amount > remaining)
    throw new Error(`Puedes registrar hasta ${remaining} unidades.`);
  order.done = (order.done ?? 0) + amount;
  if (amount || note)
    (order.history ??= []).push({
      date: eventDate(),
      qty: amount,
      note,
      stage: order.stage,
      operatorCode: order.operatorCode,
      operatorName: operatorName(state, order.operatorCode),
    });
  order.note = note;
  if (!finish) {
    order.status = order.done ? "Parcial" : "En proceso";
    return;
  }
  if (!order.done) throw new Error("Registra una cantidad antes de avanzar.");
  const steps = order.routeSteps ?? state.routes[order.route]?.steps ?? [];
  const exact = steps.indexOf(order.stage);
  const index =
    exact >= 0
      ? exact
      : steps.findIndex(
          (stage) => machineKey(stage) === machineKey(order.stage),
        );
  if (index >= 0 && index + 1 < steps.length) {
    Object.assign(order, {
      availableQty: order.done,
      stage: steps[index + 1],
      done: 0,
      machine: "",
      status: "Pendiente",
      started: false,
      operatorCode: "",
      finished: true,
    });
  } else
    Object.assign(order, {
      status: "Lista para despacho",
      started: false,
      finished: true,
    });
}
