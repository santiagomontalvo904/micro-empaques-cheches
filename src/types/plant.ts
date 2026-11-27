export type Cell = string | number;
export type Route = { name: string; steps: string[] };
export type Machines = Record<string, string[]>;
export type Operator = { code: string; name: string };

export interface ProductionEvent {
  date: string;
  qty: number;
  note: string;
  stage?: string;
  event?: string;
  operatorCode?: string;
  operatorName?: string;
  defects?: number;
}
export interface Operation {
  stage: string;
  produced: number;
  passed: number;
  defects?: number;
  machine: string;
  status: string;
  started: boolean;
  startedBy?: string;
  history?: ProductionEvent[];
}
type Lane = { qty: number; steps: Operation[]; orderNumber?: string };
export type Streams =
  | { kind: "linear"; main: Lane }
  | {
      kind: "parallel";
      mergeQty: number;
      corr: Lane;
      conv: Lane;
      shared: { steps: Operation[] };
    };
export type Group = "main" | "corr" | "conv" | "shared";
export type Task = { group: Group; index: number; op: Operation; lane: string };
export interface Delivery {
  active: boolean;
  dispatchedQty: number;
  defectsQty: number;
  eligibleQty: number;
  deliveredQty: number;
  status?: string;
  history?: ProductionEvent[];
}
export interface Order {
  corr: string;
  conv?: string;
  customer?: string;
  product: string;
  qty: number;
  corrQty?: number;
  convQty?: number;
  route: number;
  routeName?: string;
  routeSteps?: string[];
  stage: string;
  done?: number;
  day?: number;
  note?: string;
  status?: string;
  priority?: string;
  entryDate?: Cell;
  dispatchDate?: Cell;
  dueDate?: Cell;
  cabida?: Cell;
  availableQty?: number;
  machine?: string;
  started?: boolean;
  finished?: boolean;
  operatorCode?: string;
  history?: ProductionEvent[];
  isDemo?: boolean;
  streams?: Streams | null;
  delivery?: Delivery;
  sourceSheet?: string;
  sourceFile?: string;
  sourceHeaders?: string[];
  sourceValues?: Cell[];
  technicalImageId?: string;
  technicalImageName?: string;
  technicalImageType?: string;
}
export interface PlantState {
  orders: Order[];
  routes: Route[];
  machines: Machines;
  operators?: Operator[];
  lastImportAt?: string;
  routeCatalogVersion?: 1;
  packingRules?: unknown;
}
export interface PlantSnapshot {
  revision: number;
  state: PlantState;
  lastBackupAt: string | null;
  lastBackupFile: string | null;
  committedMutationIds: string[];
}
export interface WorkbookPreview {
  file: string;
  sheet: string;
  sheets: string[];
  headers: string[];
  rows: Cell[][];
}
