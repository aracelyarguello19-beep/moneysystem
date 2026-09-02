// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/inventario/listar-items", () => ({
  listarItems: vi.fn().mockResolvedValue({ ok: true, data: [] }),
}));
vi.mock("@/actions/catalogos/listar-monedas", () => ({
  listarMonedas: vi.fn().mockResolvedValue({ ok: true, data: [] }),
}));
vi.mock("@/actions/cuentas-financieras/listar-cuentas-financieras", () => ({
  listarCuentasFinancieras: vi.fn().mockResolvedValue({ ok: true, data: [] }),
}));
vi.mock("@/actions/ventas/registrar-venta", () => ({
  registrarVenta: vi.fn(),
}));

import { registrarVenta } from "@/actions/ventas/registrar-venta";
import { RegistrarVentaForm } from "@/components/forms/registrar-venta-form";

// [Source: architecture/testing-strategy.md#Test Examples]
describe("RegistrarVentaForm", () => {
  it("no permite enviar sin cliente cuando la forma de cobro es CREDITO_CLIENTE", async () => {
    const user = userEvent.setup();
    render(<RegistrarVentaForm negocioId="negocio-1" />);

    await user.click(screen.getByRole("button", { name: /crédito/i }));
    await user.click(screen.getByRole("button", { name: /^registrar venta/i }));

    expect(await screen.findByText(/cliente es requerido/i)).toBeInTheDocument();
    expect(registrarVenta).not.toHaveBeenCalled();
  });
});
