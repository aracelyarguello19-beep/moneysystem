import { obtenerPerfil } from "@/actions/auth/obtener-perfil";
import { EditarPerfilForm } from "@/components/editar-perfil-form";
import { CambiarContrasenaForm } from "@/components/cambiar-contrasena-form";
import { EliminarCuentaButton } from "@/components/eliminar-cuenta-button";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const result = await obtenerPerfil();

  return (
    <main className="flex flex-col gap-10 p-margin-mobile md:p-margin-desktop">
      <div>
        <h1 className="text-xl font-semibold">Mi perfil</h1>
      </div>

      {!result.ok && (
        <p role="alert" className="text-sm text-danger">
          {result.error.message}
        </p>
      )}

      {result.ok && (
        <>
          <EditarPerfilForm
            email={result.data.email}
            nombreActual={result.data.nombre}
            avatarUrlActual={result.data.avatarUrl}
          />
          <CambiarContrasenaForm />
          <EliminarCuentaButton />
        </>
      )}
    </main>
  );
}
