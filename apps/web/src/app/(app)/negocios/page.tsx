import { getCurrentAccount } from "@/lib/auth";
import { listarNegocios } from "@/actions/negocios/listar-negocios";
import { CrearNegocioForm } from "./crear-negocio-form";
import { ArchivarNegocioButton } from "./archivar-negocio-button";

export const dynamic = "force-dynamic";

export default async function NegociosPage() {
  const cuenta = await getCurrentAccount();
  const result = await listarNegocios();
  const negocios = result.ok ? result.data : [];

  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Negocios</h1>
        <p className="text-sm text-muted">Sesión iniciada como {cuenta?.email}.</p>
      </div>

      <CrearNegocioForm />

      {!result.ok && (
        <p role="alert" className="text-sm text-danger">
          {result.error.message}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {negocios.map((negocio) => (
          <li
            key={negocio.id}
            className="flex items-center justify-between rounded border border-default px-4 py-2"
          >
            <div>
              <p className="font-medium">{negocio.nombre}</p>
              <p className="text-xs text-muted">
                {negocio.estado} · {negocio.tipo}
              </p>
            </div>
            {negocio.estado === "ACTIVO" && (
              <ArchivarNegocioButton negocioId={negocio.id} />
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
