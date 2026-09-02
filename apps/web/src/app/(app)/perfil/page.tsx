import { obtenerPerfil } from "@/actions/auth/obtener-perfil";
import { EditarPerfilForm } from "@/components/editar-perfil-form";
import { EliminarCuentaButton } from "@/components/eliminar-cuenta-button";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const result = await obtenerPerfil();

  return (
    <main className="flex flex-col gap-10 p-8">
      <div>
        <h1 className="text-xl font-semibold">Mi perfil</h1>
        {result.ok && (
          <p className="text-sm text-muted">{result.data.email}</p>
        )}
      </div>

      {!result.ok && (
        <p role="alert" className="text-sm text-danger">
          {result.error.message}
        </p>
      )}

      {result.ok && (
        <>
          <EditarPerfilForm nombreActual={result.data.nombre} />
          <EliminarCuentaButton />
        </>
      )}
    </main>
  );
}
