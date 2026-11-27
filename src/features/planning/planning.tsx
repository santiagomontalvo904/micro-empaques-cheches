"use client";

import { useRef, useState } from "react";
import { Badge, Heading, Panel, RouteSteps, units } from "@/components/ui";
import {
  OrderDetails,
  OrderImageUpload,
} from "@/features/orders/order-details";
import { orderKey, orderStatus } from "@/features/orders/order-flow";
import { usePlant } from "@/features/plant/plant-context";
import type { WorkbookPreview } from "@/types/plant";
import {
  guessMapping,
  importFields,
  importOrders,
  type Mapping,
} from "./import-orders";

export function Planning() {
  const { snapshot, status, save } = usePlant();
  const state = snapshot?.state;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<WorkbookPreview>();
  const [mapping, setMapping] = useState<Mapping>({});
  const [route, setRoute] = useState(0);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const loadedRoute = state?.routes[route] ?? state?.routes[0];

  async function load(selectedFile: File, sheet = "") {
    setReading(true);
    setResult("");
    setError("");
    setPreview(undefined);
    try {
      if (!/\.(xlsx|csv)$/i.test(selectedFile.name))
        throw new Error("Selecciona un archivo .xlsx o .csv.");
      const response = await fetch("/api/import/preview", {
        method: "POST",
        body: selectedFile,
        headers: {
          "X-File-Name": encodeURIComponent(selectedFile.name),
          "X-Sheet-Name": encodeURIComponent(sheet),
        },
      });
      const data = (await response.json()) as WorkbookPreview & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "No se pudo leer el archivo.");
      setPreview(data);
      setMapping(guessMapping(data.headers));
      setResult(`Archivo listo · ${units(data.rows.length)} filas detectadas`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo leer el archivo.",
      );
    } finally {
      setReading(false);
    }
  }

  async function importPreview() {
    if (!preview) return;
    let summary = "";
    const confirmed = await save((next) => {
      const { added, updated, invalid } = importOrders(
        next,
        preview,
        mapping,
        route,
      );
      summary = `${added} nuevas · ${updated} actualizadas · ${invalid} filas inválidas`;
    }, "Importación confirmada.");
    if (confirmed) setResult(summary);
  }

  return (
    <>
      <Heading
        title="Importar / actualizar órdenes"
        description="Carga el libro de planeación, revisa la hoja y confirma las columnas."
        actions={
          <button
            className="button"
            onClick={() =>
              file ? void load(file, preview?.sheet) : input.current?.click()
            }
            disabled={reading || status === "saving"}
          >
            Actualizar vista previa
          </button>
        }
      />
      {state?.lastImportAt && (
        <p className="muted">
          Última importación confirmada ·{" "}
          {new Date(state.lastImportAt).toLocaleString("es-CO")}
        </p>
      )}
      <Panel title="Importar desde el libro de planeación">
        <label className="field">
          Archivo Excel o CSV
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv"
            disabled={reading || status === "saving"}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (selected) {
                setFile(selected);
                void load(selected);
              }
            }}
          />
        </label>
        {file && <p className="muted">{file.name}</p>}
        {reading && <p role="status">Leyendo archivo…</p>}
        {error && (
          <p className="import-action-status" data-kind="error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <p className="import-action-status" data-kind="ok" role="status">
            {result}
          </p>
        )}
        {preview && (
          <>
            <div className="form-grid">
              <label className="field">
                Hoja del libro
                <select
                  value={preview.sheet}
                  disabled={status === "saving"}
                  onChange={(event) => {
                    if (file) void load(file, event.target.value);
                  }}
                >
                  {preview.sheets.map((sheet) => (
                    <option key={sheet}>{sheet}</option>
                  ))}
                </select>
              </label>
              {importFields.map(([key, label, required]) => (
                <label className="field" key={key}>
                  {label}
                  {required ? " · obligatorio" : ""}
                  <select
                    value={mapping[key] ?? -1}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        [key]: Number(event.target.value),
                      })
                    }
                  >
                    <option value={-1}>Sin asignar</option>
                    {preview.headers.map((header, index) => (
                      <option key={index} value={index}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="field">
                Ruta general
                <select
                  value={route}
                  onChange={(event) => setRoute(Number(event.target.value))}
                >
                  {state?.routes.map((item, index) => (
                    <option key={index} value={index}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {loadedRoute && <RouteSteps steps={loadedRoute.steps} />}
            <p className="muted">
              Vista previa de {Math.min(preview.rows.length, 6)} de{" "}
              {units(preview.rows.length)} filas
            </p>
            <div className="tablewrap import-preview">
              <table>
                <thead>
                  <tr>
                    {preview.headers.map((header, index) => (
                      <th key={index}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 6).map((row, index) => (
                    <tr key={index}>
                      {preview.headers.map((_, col) => (
                        <td key={col}>{row[col]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="button primary"
              disabled={status !== "online" || !loadedRoute}
              onClick={() => void importPreview()}
            >
              Cargar y actualizar órdenes
            </button>
          </>
        )}
      </Panel>
      <Panel title="Órdenes cargadas">
        {state?.orders.length ? (
          <div className="order-list">
            {state.orders.map((order) => (
              <article className="loaded-order" key={orderKey(order)}>
                <div>
                  <OrderDetails order={order} />
                  <p className="muted">
                    OC {order.corr}
                    {order.conv && ` · OV ${order.conv}`} · {order.routeName} ·{" "}
                    {units(order.qty)} cajas
                  </p>
                  <p className="muted">
                    {order.priority || "Normal"} · Despacho{" "}
                    {order.dispatchDate || "—"}
                  </p>
                </div>
                <Badge>{orderStatus(order)}</Badge>
                <OrderImageUpload order={order} />
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No hay órdenes cargadas.</p>
        )}
      </Panel>
    </>
  );
}
