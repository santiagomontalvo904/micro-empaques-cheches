import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PlantShell } from "@/components/plant-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Micro Empaques Cheches · Planta",
  description: "Planeación y seguimiento de producción",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-CO">
      <body>
        <PlantShell>{children}</PlantShell>
      </body>
    </html>
  );
}
