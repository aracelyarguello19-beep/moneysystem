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
          cxc: null,
          items: [
            {
              id: "vi-1",
              ventaId: "venta-1",
              itemId: "item-1",
              nombreLibre: null,
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
          cxc: null,
          items: [
            {
              id: "vi-2",
              ventaId: "venta-2",
              itemId: "item-1",
              nombreLibre: null,
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

  it('no muestra "Cobrado" en una venta a crédito CANCELADA aunque la CxC haya quedado en PAGADO por la devolución', async () => {
    // `calcularEstadoCxC` devuelve "PAGADO" en cuanto `montoOriginal` llega a
    // 0 (una devolución total lo deja así) aunque `montoPagado` sea "0" — es
    // decir, nunca se cobró nada. Mostrar "Cobrado" ahí, junto al badge
    // "CANCELADA", es lo que reportó el usuario como contradictorio.
    vi.mocked(listarVentas).mockResolvedValue({
      ok: true,
      data: [
        {
          id: "venta-3",
          negocioId: "negocio-1",
          cliente: "Ander",
          fecha: new Date("2026-09-12"),
          formaCobro: "CREDITO_CLIENTE",
          impuesto: "0",
          estado: "CANCELADA",
          cuentaFinancieraId: null,
          monedaId: "moneda-1",
          tasaCambioId: null,
          cxc: { estado: "PAGADO", montoOriginal: "0", montoPagado: "0" },
          items: [
            {
              id: "vi-3",
              ventaId: "venta-3",
              itemId: "item-1",
              nombreLibre: null,
              cantidad: "1",
              precioUnitario: "195000",
              costoServicio: null,
              costoUnitario: "100000",
              cantidadDevuelta: "1",
              esLibre: false,
              itemNombre: "Adidas Gazelle Negro",
              itemTipo: "PRODUCTO",
            },
          ],
        },
      ],
    });

    render(<VentasLista negocioId="negocio-1" />);

    await screen.findByText("CANCELADA");
    expect(screen.queryByText("Cobrado")).not.toBeInTheDocument();
  });
});
