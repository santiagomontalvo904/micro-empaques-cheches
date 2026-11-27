import type {
  Group,
  Machines,
  Operation,
  Order,
  Route,
  Streams,
  Task,
} from "@/types/plant";

const machineCategories: [RegExp, string][] = [
  [/corrug/, "Corrugador"],
  [/lamin/, "Laminado"],
  [/troquel/, "Troquelado"],
  [/flexog/, "Flexográfica"],
  [/impres/, "Impresión"],
  [/convertidora/, "Convertidora"],
  [/guillotina/, "Guillotina"],
  [/cuchill|score|refil/, "Cuchillos / score"],
  [/zunch|sunch/, "Zuncho"],
  [/stretch|estres/, "Stretch"],
  [/despique/, "Despique"],
  [/pegad|pegue|cier/, "Pegadoras"],
  [/contad|conteo/, "Contada"],
  [/encajad/, "Encajada"],
  [/empaque/, "Contada"],
  [/despacho|estiba/, "Despacho"],
];

export function machineKey(stage: string) {
  return (
    machineCategories.find(([pattern]) =>
      pattern.test(stage.toLocaleLowerCase("es")),
    )?.[1] ?? stage.split(" ")[0]
  );
}

export function machineOptions(
  stage: string,
  order: Order,
  machines: Machines,
) {
  const key = machineKey(stage);
  let available = machines[key] ?? ["Equipo por definir en planta"];
  if (key === "Corrugador" && !/micro/i.test(order.product))
    available = available.filter((machine) =>
      machine.startsWith("Corrugador 2"),
    );
  if (key === "Impresión" && /según pedido/i.test(stage))
    available = available.filter((machine) =>
      /Aurelia|Heidelberg/i.test(machine),
    );
  return [...new Set(available)];
}

const emptyOperation = (stage: string): Operation => ({
  stage,
  produced: 0,
  passed: 0,
  defects: 0,
  machine: "",
  status: "Pendiente",
  started: false,
  history: [],
});

export function createStreams(order: Order, steps: string[]): Streams {
  const { corr, conv, qty } = order;
  const corrQty = Number(order.corrQty) || qty;
  const convQty = Number(order.convQty) || qty;
  const mergeIndex = steps.findIndex(
    (stage) => machineKey(stage) === "Laminado",
  );
  if (mergeIndex < 0 || !corr || !conv)
    return { kind: "linear", main: { qty, steps: steps.map(emptyOperation) } };
  const preSteps = steps.slice(0, mergeIndex);
  const corrSteps = preSteps.filter(
    (stage) => machineKey(stage) === "Corrugador",
  );
  const convSteps = preSteps.filter(
    (stage) => machineKey(stage) !== "Corrugador",
  );
  if (!corrSteps.length) corrSteps.push("Corrugador");
  if (!convSteps.some((stage) => machineKey(stage) === "Convertidora"))
    convSteps.unshift("Convertidora");
  return {
    kind: "parallel",
    mergeQty: Math.min(corrQty, convQty, qty),
    corr: {
      orderNumber: corr,
      qty: corrQty,
      steps: corrSteps.map(emptyOperation),
    },
    conv: {
      orderNumber: conv,
      qty: convQty,
      steps: convSteps.map(emptyOperation),
    },
    shared: { steps: steps.slice(mergeIndex).map(emptyOperation) },
  };
}

export function allOperations(order: Order): Task[] {
  const streams = order.streams;
  if (!streams) return [];
  if (streams.kind === "linear")
    return streams.main.steps.map((op, index) => ({
      group: "main",
      index,
      op,
      lane: "Ruta",
    }));
  return [
    ...streams.corr.steps.map((op, index): Task => ({
      group: "corr",
      index,
      op,
      lane: "Corrugación",
    })),
    ...streams.conv.steps.map((op, index): Task => ({
      group: "conv",
      index,
      op,
      lane: "Convertidora",
    })),
    ...streams.shared.steps.map((op, index): Task => ({
      group: "shared",
      index,
      op,
      lane: index === 0 ? "Unión · Laminado" : "Después de laminado",
    })),
  ];
}

function lastPassed(steps: Operation[]) {
  return steps.at(-1)?.passed ?? 0;
}

function mergeCapacity(streams: Extract<Streams, { kind: "parallel" }>) {
  return Math.min(
    lastPassed(streams.corr.steps),
    lastPassed(streams.conv.steps),
    streams.mergeQty,
  );
}

export function capacity(order: Order, group: Group, index: number) {
  const streams = order.streams;
  if (!streams) return 0;
  if (streams.kind === "linear")
    return index === 0
      ? streams.main.qty
      : (streams.main.steps[index - 1]?.passed ?? 0);
  if (group === "main") return 0;
  if (index > 0) return streams[group].steps[index - 1]?.passed ?? 0;
  return group === "shared" ? mergeCapacity(streams) : streams[group].qty;
}

export function orderStatus(order: Order) {
  if (order.delivery?.status === "Entregado") return "Completada";
  if (order.delivery?.active)
    return order.delivery.status || "Pendiente de entrega";
  const streams = order.streams;
  if (!streams) return order.status ?? "Pendiente";
  if (streams.kind === "parallel") {
    if (lastPassed(streams.shared.steps) >= order.qty) return "Completada";
    if (mergeCapacity(streams) > (streams.shared.steps[0]?.passed ?? 0))
      return "Lista para avanzar";
  } else if (lastPassed(streams.main.steps) >= streams.main.qty)
    return "Lista para despacho";
  return allOperations(order).some((task) => task.op.produced > 0)
    ? "Parcial"
    : "Pendiente";
}

export function orderProgress(order: Order) {
  const streams = order.streams;
  if (!streams) return { done: order.done ?? 0, qty: order.qty };
  if (streams.kind === "parallel")
    return { done: streams.shared.steps[0]?.produced ?? 0, qty: order.qty };
  return { done: lastPassed(streams.main.steps), qty: streams.main.qty };
}

export function hasProgress(order: Order) {
  return Boolean(
    order.done ||
    order.started ||
    order.finished ||
    order.delivery?.active ||
    allOperations(order).some(
      ({ op }) => op.produced || op.passed || op.started || op.history?.length,
    ),
  );
}

export function upgradeLegacyOrder(order: Order, routes: Route[]) {
  if (order.streams) return;
  const route = routes[order.route];
  const steps = order.routeSteps?.length ? order.routeSteps : route?.steps;
  if (!steps?.length) return;
  order.routeSteps = [...steps];
  order.routeName ||= route?.name || `Ruta ${Number(order.route) + 1}`;
  order.streams = createStreams(order, steps);
  const tasks = allOperations(order);
  const task =
    tasks.find(({ op }) => op.stage === order.stage) ??
    tasks.find(
      ({ op }) => machineKey(op.stage) === machineKey(order.stage || ""),
    );
  if (!task) {
    order.streams = null;
    return;
  }
  const upstream = order.streams.kind === "parallel" && task.group === "shared";
  for (const previous of tasks) {
    const priorLane =
      upstream && (previous.group === "corr" || previous.group === "conv");
    if (
      !priorLane &&
      (previous.group !== task.group || previous.index >= task.index)
    )
      continue;
    const available = capacity(order, previous.group, previous.index);
    const limit =
      priorLane || previous.group === "corr" || previous.group === "conv"
        ? available
        : Number(order.availableQty) || order.qty;
    previous.op.produced = previous.op.passed = Math.min(available, limit);
    previous.op.status = "Completa";
  }
  const { op } = task;
  op.produced = Number(order.done) || 0;
  if (
    order.status === "Lista para avanzar" ||
    op.produced >= capacity(order, task.group, task.index)
  )
    op.passed = op.produced;
  op.machine = order.machine || "";
  op.started = Boolean(order.started);
  op.startedBy =
    order.operatorCode ||
    order.history?.findLast((event) => event.operatorCode)?.operatorCode;
  op.status =
    op.passed === op.produced && op.produced
      ? "Completa"
      : op.produced
        ? "Parcial"
        : op.started
          ? "En proceso"
          : "Pendiente";
  op.history = [...(order.history ?? [])];
}

export const orderKey = (order: Order) =>
  JSON.stringify([order.corr, order.conv || ""]);
