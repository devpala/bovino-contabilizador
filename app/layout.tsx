import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contabilizador Bovino",
  description: "Registro de vacunacion bovina con Next.js y PostgreSQL.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
