import { NextResponse } from "next/server";
import { esUltimoDiaDelMes } from "@repo/domain";
import { ejecutarCierreDePeriodo } from "@/lib/cron/cierre-periodo";

// ADR-001: Vercel Cron llama este endpoint diariamente (`vercel.json`,
// `0 6 * * *`) e inyecta automáticamente `Authorization: Bearer $CRON_SECRET`.
// Es no-op salvo que la fecha sea el último día calendario del mes (único
// período soportado, MENSUAL) — `ejecutarCierreDePeriodo` es idempotente
// (`ultimoPeriodoAplicado`) para el caso de reintento del cron el mismo día.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ahora = new Date();
  if (!esUltimoDiaDelMes(ahora)) {
    return NextResponse.json({ status: "skipped", reason: "not_last_day_of_month" });
  }

  const resultado = await ejecutarCierreDePeriodo(ahora);
  return NextResponse.json({ status: "ok", ...resultado });
}
