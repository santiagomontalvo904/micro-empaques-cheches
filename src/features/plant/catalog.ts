import type { Machines } from "@/types/plant";
import demo from "../../../demo-data.json";

export const defaultRoutes = demo.routes;
export const defaultMachines: Machines = {
  Corrugador: ["Corrugador 1 · solo micro", "Corrugador 2 · micro / B / C"],
  Laminado: [
    "Laminadora automática grande",
    "Laminadora automática pequeña",
    "Laminadora semiautomática",
  ],
  Troquelado: [
    "Troqueladora automática pequeña",
    "Troqueladora automática grande",
    "Troqueladora quijada grande",
    "Troqueladora quijada pequeña",
    "Troqueladora quijada mediana",
  ],
  Impresión: ["Heidelberg · 5 colores + barniz", "Aurelia · 2 colores"],
  Flexográfica: ["Flexográfica"],
  Guillotina: ["Guillotina"],
  "Cuchillos / score": [
    "Equipo de cuchillos / score / refilado · definir en planta",
  ],
  Zuncho: ["Zunchadora · definir en planta"],
  Stretch: ["Equipo de estresado · definir en planta"],
  Encajada: ["Puesto de encajado · definir en planta"],
  Contada: ["Equipo de conteo · definir en planta"],
  Despacho: ["Puesto de despacho · definir en planta"],
  Despique: ["Mesa de despique"],
  Pegadoras: [
    "Pegadora de caja regular",
    "Pegadora doble pieza",
    "Pegada manual",
  ],
  Convertidora: ["Equipo de convertidora · definir en planta"],
};
export type Station = {
  id: string;
  label: string;
  keys: string[];
  delivery?: boolean;
};
export const stations: Station[] = [
  { id: "corrugadores", label: "Corrugadores", keys: ["Corrugador"] },
  { id: "convertidora", label: "Convertidora", keys: ["Convertidora"] },
  { id: "guillotina", label: "Guillotina", keys: ["Guillotina"] },
  { id: "impresion", label: "Impresoras", keys: ["Impresión"] },
  { id: "flexografica", label: "Flexográfica", keys: ["Flexográfica"] },
  { id: "laminadoras", label: "Laminadoras", keys: ["Laminado"] },
  { id: "cuchillos", label: "Cuchillos / score", keys: ["Cuchillos / score"] },
  { id: "troqueladoras", label: "Troqueladoras", keys: ["Troquelado"] },
  { id: "despique", label: "Despique", keys: ["Despique"] },
  { id: "pegadoras", label: "Pegadoras", keys: ["Pegadoras"] },
  { id: "contada", label: "Contada", keys: ["Contada"] },
  { id: "encajada", label: "Encajada", keys: ["Encajada"] },
  { id: "estresada", label: "Estresada", keys: ["Stretch"] },
  { id: "zunchada", label: "Zunchada", keys: ["Zuncho"] },
  { id: "despacho", label: "Despacho", keys: ["Despacho"] },
  { id: "entregado", label: "Entregado a cliente", delivery: true, keys: [] },
];
