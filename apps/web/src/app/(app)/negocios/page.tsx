import { listarNegocios } from "@/actions/negocios/listar-negocios";
import { CrearNegocioForm } from "./crear-negocio-form";
import { MisNegociosLista } from "./mis-negocios-lista";

export const dynamic = "force-dynamic";

export default async function NegociosPage() {
  const result = await listarNegocios();
  const negocios = result.ok ? result.data : [];

  return (
    <main className="flex flex-col gap-6 p-margin-mobile md:p-margin-desktop">
      <div>
        <h1 className="text-xl font-semibold">Negocios</h1>
      </div>

      <CrearNegocioForm />

      {!result.ok && (
        <p role="alert" className="text-sm text-danger">
          {result.error.message}
        </p>
      )}

      <MisNegociosLista negocios={negocios} />
    </main>
  );
}
