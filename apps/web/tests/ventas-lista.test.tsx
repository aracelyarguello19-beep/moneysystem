// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/actions/ventas/listar-ventas", () => ({
  listarVentas: vi.fn(),
}));

import { listarVentas } from "@/actions/ventas/listar-ventas";
import { VentasLista } from "@/components/ventas-lista";

describe("VentasLista", () => {
  it('marca como "dato incompleto" una línea de Servicio sin costoServicio', async () => {
    vi.mocked(listarVentas).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "venta-1",
          negocioId: "negocio-1",
          cliente: null,
          fecha: new Date("2026-09-01"),
          formaCobro: "EFECTIVO",
          impuesto: "0",
          estado: "ACTIVA",
          cuentaFinancieraId: "cf-1",
          monedaId: "moneda-1",
          tasaCambioId: null,
          items: [
            {
              id: "vi-1",
              ventaId: "venta-1",
              itemId: "item-1",
              cantidad: null,
              precioUnitario: "100.00",
              costoServicio: null,
              costoUnitario: null,
              cantidadDevuelta: "0",
              esLibre: false,
              itemNombre: "Consultoría",
              itemTipo: "SERVICIO",
            },
          ],
        },
      ],
    });

    render(<VentasLista negocioId="negocio-1" />);

    expect(await screen.findByText(/dato incompleto/i)).toBeInTheDocument();
  });

  it('no marca "dato incompleto" cuando el Servicio tiene costo registrado', async () => {
    vi.mocked(listarVentas).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "venta-2",
          negocioId: "negocio-1",
          cliente: null,
          fecha: new Date("2026-09-01"),
          formaCobro: "EFECTIVO",
          impuesto: "0",
          estado: "ACTIVA",
          cuentaFinancieraId: "cf-1",
          monedaId: "moneda-1",
          tasaCambioId: null,
          items: [
            {
              id: "vi-2",
              ventaId: "venta-2",
              itemId: "item-1",
              cantidad: null,
              precioUnitario: "100.00",
              costoServicio: "40.00",
              costoUnitario: null,
              cantidadDevuelta: "0",
              esLibre: false,
              itemNombre: "Consultoría",
              itemTipo: "SERVICIO",
            },
          ],
        },
      ],
    });

    render(<VentasLista negocioId="negocio-1" />);

    await screen.findByText("Consultoría");
    expect(screen.queryByText(/dato incompleto/i)).not.toBeInTheDocument();
  });
});
