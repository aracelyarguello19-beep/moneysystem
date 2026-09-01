// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/negocios/listar-negocios", () => ({
  listarNegocios: vi.fn(),
}));

import { listarNegocios } from "@/actions/negocios/listar-negocios";
import { NegocioSelector } from "@/components/negocio-selector";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

const negocios = [
  {
    id: "negocio-1",
    cuentaId: "cuenta-1",
    nombre: "Negocio Uno",
    estado: "ACTIVO" as const,
    createdAt: new Date(),
    archivedAt: null,
  },
  {
    id: "negocio-2",
    cuentaId: "cuenta-1",
    nombre: "Negocio Dos",
    estado: "ACTIVO" as const,
    createdAt: new Date(),
    archivedAt: null,
  },
];

describe("NegocioSelector", () => {
  beforeEach(() => {
    useNegocioActivoStore.setState({ ambito: "LABORAL", negocioActivoId: null });
    vi.mocked(listarNegocios).mockResolvedValue({ ok: true, data: negocios });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cambia negocioActivoId en el store al elegir otro negocio", async () => {
    const user = userEvent.setup();
    render(<NegocioSelector />);

    await waitFor(() => expect(useNegocioActivoStore.getState().negocioActivoId).toBe("negocio-1"));

    await user.selectOptions(screen.getByLabelText(/negocio activo/i), "negocio-2");

    expect(useNegocioActivoStore.getState().negocioActivoId).toBe("negocio-2");
  });
});
