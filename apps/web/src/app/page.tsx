import { checkDatabaseHealth } from "@repo/database";
import { Button } from "@/components/ui/button";

// Refleja el estado real de la DB en cada request — no debe quedar
// pre-renderizada estáticamente en build time (AC2: "confirma que el
// sistema y su base de datos están operativos", tiempo real).
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const isConnected = await checkDatabaseHealth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 sm:p-8">
      <h1 className="text-xl font-semibold">Money System</h1>
      <p>
        Sistema:{" "}
        <span className="font-mono text-primary">operativo</span>
      </p>
      <p>
        Base de datos:{" "}
        <span
          className={`font-mono ${isConnected ? "text-primary" : "text-danger"}`}
        >
          {isConnected ? "conectada" : "sin conexión"}
        </span>
      </p>
      <div className="mt-4 flex gap-4">
        <Button asChild variant="link">
          <a href="/login">Iniciar sesión</a>
        </Button>
        <Button asChild variant="link">
          <a href="/registro">Crear cuenta</a>
        </Button>
      </div>
    </main>
  );
}
