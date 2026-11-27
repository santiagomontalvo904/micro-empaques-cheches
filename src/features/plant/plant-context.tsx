"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Order, PlantState } from "@/types/plant";
import { orderKey } from "@/features/orders/order-flow";
import { PlantClient, type PlantView } from "./plant-client";
import { readLocal, writeLocal } from "./journal";

type Selection = { area: string; machine: string };
type Context = PlantView & {
  selection: Selection;
  select: (selection: Selection) => void;
  kiosk: boolean;
  setKiosk: (value: boolean) => void;
  message: string;
  notify: (message: string) => void;
  save: (
    edit: (state: PlantState) => void,
    confirmation?: string,
  ) => Promise<boolean>;
  discardConflict: () => Promise<void>;
};

const PlantContext = createContext<Context | null>(null);

export function PlantProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<PlantView>({ status: "loading" });
  const [message, notify] = useState("");
  const [kiosk, updateKiosk] = useState(false);
  const [selection, updateSelection] = useState<Selection>({
    area: "corrugadores",
    machine: "*",
  });
  const client = useRef<PlantClient>(null);
  useEffect(() => {
    const connection = new PlantClient(setView);
    client.current = connection;
    updateKiosk(readLocal("mc_operator_kiosk", false));
    updateSelection(
      readLocal("mc_station_selection", { area: "corrugadores", machine: "*" }),
    );
    void connection.start();
    return () => connection.dispose();
  }, []);

  async function save(
    edit: (state: PlantState) => void,
    confirmation = "Guardado y confirmado por el servidor.",
  ) {
    try {
      notify("");
      const saved = await client.current?.save(edit);
      if (saved) notify(confirmation);
      return Boolean(saved);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el cambio.",
      );
      return false;
    }
  }

  return (
    <PlantContext.Provider
      value={{
        ...view,
        message,
        notify,
        save,
        kiosk,
        selection,
        select(value) {
          updateSelection(value);
          writeLocal("mc_station_selection", value);
        },
        setKiosk(value) {
          updateKiosk(value);
          writeLocal("mc_operator_kiosk", value);
        },
        async discardConflict() {
          try {
            await client.current?.discardConflict();
          } catch {
            notify("No se pudo eliminar el cambio pendiente de la cola local.");
          }
        },
      }}
    >
      {children}
    </PlantContext.Provider>
  );
}

export function usePlant() {
  const context = useContext(PlantContext);
  if (!context) throw new Error("Falta PlantProvider.");
  return context;
}

export function findOrder(state: PlantState, order: Order) {
  const found = state.orders.find(
    (candidate) => orderKey(candidate) === orderKey(order),
  );
  if (!found) throw new Error("La orden cambió o ya no está disponible.");
  return found;
}
