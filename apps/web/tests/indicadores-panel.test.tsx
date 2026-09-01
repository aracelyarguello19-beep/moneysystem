// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/indicadores/obtener-indicadores", () => ({
  obtenerIndicadores: vi.fn(),
}));

import { obtenerIndicadores } from "@/actions/indicadores/obtener-indicadores";
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

// AC3 (Story 5.2): cambiar el período dispara solo un nuevo fetch (mismo
// componente montado), no un reload de la página.
describe("IndicadoresPanel", () => {
  it("vuelve a pedir los indicadores con el nuevo período sin desmontar el panel", async () => {
    vi.mocked(obtenerIndicadores).mockResolvedValue({ ok: true, data: indicadoresBase });
    const user = userEvent.setup();

    render(<IndicadoresPanel negocioId="negocio-1" />);
    await screen.findByText("Ingresos Brutos");

    const primeraLlamada = vi.mocked(obtenerIndicadores).mock.calls.length;
    const inputDesde = screen.getByLabelText(/desde/i);

    await user.clear(inputDesde);
    await user.type(inputDesde, "2026-01-01");
    await user.click(screen.getByRole("button", { name: /actualizar/i }));

    expect(vi.mocked(obtenerIndicadores).mock.calls.length).toBeGreaterThan(primeraLlamada);
    // El mismo panel sigue montado — el título de la sección persiste sin re-crear la página.
    expect(screen.getByText("Ingresos Brutos")).toBeInTheDocument();

    const ultimaLlamada = vi.mocked(obtenerIndicadores).mock.calls.at(-1);
    expect(ultimaLlamada?.[1]).toMatchObject({ desde: "2026-01-01" });
  });
});
