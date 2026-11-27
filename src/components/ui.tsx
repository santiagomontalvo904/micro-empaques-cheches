import type { ReactNode } from "react";

export function Heading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="sub">{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel sectiongap">
      <div className="panelhead">
        <h2>{title}</h2>
      </div>
      <div className="panelbody">{children}</div>
    </section>
  );
}

export function Badge({ children }: { children: string }) {
  const color = /parcial|espera/i.test(children)
    ? "amber"
    : /pendiente/i.test(children)
      ? "gray"
      : /proceso|avanzar/i.test(children)
        ? "blue"
        : "green";
  return <span className={`status ${color}`}>{children}</span>;
}

export function RouteSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="routeflow route-steps">
      {steps.map((stage, index) => (
        <li className="stepchip" key={index}>
          {stage}
        </li>
      ))}
    </ol>
  );
}

export const units = (value: number) =>
  Number(value || 0).toLocaleString("es-CO");
