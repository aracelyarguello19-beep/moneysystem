import { checkDatabaseHealth } from "@repo/database";

// Refleja el estado real de la DB en cada request — no debe quedar
// pre-renderizada estáticamente en build time (AC2: "confirma que el
// sistema y su base de datos están operativos", tiempo real).
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const isConnected = await checkDatabaseHealth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-xl font-semibold">Sistema de Control Financiero</h1>
      <p>
        Sistema:{" "}
        <span className="font-mono text-emerald-600">operativo</span>
      </p>
      <p>
        Base de datos:{" "}
        <span
          className={`font-mono ${isConnected ? "text-emerald-600" : "text-red-600"}`}
        >
          {isConnected ? "conectada" : "sin conexión"}
        </span>
      </p>
    </main>
  );
}
