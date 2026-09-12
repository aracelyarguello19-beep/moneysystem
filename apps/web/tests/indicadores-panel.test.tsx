// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/indicadores/obtener-dashboard", () => ({
  obtenerDashboard: vi.fn(),
}));

import { obtenerDashboard } from "@/actions/indicadores/obtener-dashboard";
import { IndicadoresPanel } from "@/components/indicadores-panel";

const indicadoresBase = {
  ingresosBrutos: "100",
  ingresosNetos: "100",
  cmv: "0",
  csv: "0",
  gananciaBruta: "100",
  gastosOperativos: "0",
  resultadoOperativo: "100",
  gastosFinancieros: "0",
  gananciaLiquida: "100",
  margenGanancia: "1",
  desglose: {
    producto: { cmv: "0", gananciaBruta: "0" },
    servicio: { csv: "0", gananciaBruta: "100" },
  },
};

const dashboardDataBase = {
  indicadores: indicadoresBase,
  valorInventario: "0",
  totalGastosFijos: null,
  metaMinimaDiaria: null,
  saldosPorMoneda: [],
  valorTotalCajaGs: "0",
  valorTotalNegocio: "0",
  monedasSinCotizacion: [],
  tendencia: [],
  items: [],
  cuentasPorCobrar: [],
  movimientosRecientes: [],
};

// AC3 (Story 5.2): cambiar el período dispara solo un nuevo fetch (mismo
// componente montado), no un reload de la página.
describe("IndicadoresPanel", () => {
  it("vuelve a pedir el dashboard con el nuevo período sin desmontar el panel", async () => {
    vi.mocked(obtenerDashboard).mockResolvedValue({ ok: true, data: dashboardDataBase });
    const user = userEvent.setup();

    render(<IndicadoresPanel negocioId="negocio-1" />);
    await screen.findByText("Ventas del período");

    const primeraLlamada = vi.mocked(obtenerDashboard).mock.calls.length;

    await user.click(screen.getByRole("button", { name: /del .* al .*/i }));
    const inputDesde = screen.getByLabelText(/desde/i);
    await user.clear(inputDesde);
    await user.type(inputDesde, "2026-01-01");
    await user.click(screen.getByRole("button", { name: /aplicar/i }));

    expect(vi.mocked(obtenerDashboard).mock.calls.length).toBeGreaterThan(primeraLlamada);
    // El mismo panel sigue montado — el título de la sección persiste sin re-crear la página.
    expect(screen.getByText("Ventas del período")).toBeInTheDocument();

    const ultimaLlamada = vi.mocked(obtenerDashboard).mock.calls.at(-1);
    expect(ultimaLlamada?.[1]).toMatchObject({ desde: "2026-01-01" });
  });

  it("nunca muestra CSV — la sesión de Servicios se eliminó del sistema", async () => {
    vi.mocked(obtenerDashboard).mockResolvedValue({ ok: true, data: dashboardDataBase });
    render(<IndicadoresPanel negocioId="negocio-1" />);

    await screen.findByText("CMV");
    expect(screen.queryByText("CSV")).not.toBeInTheDocument();
  });
});
