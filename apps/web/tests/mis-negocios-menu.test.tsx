// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/negocios/listar-negocios", () => ({
  listarNegocios: vi.fn(),
}));
vi.mock("@/actions/auth/sign-out", () => ({
  signOut: vi.fn(),
}));

import { listarNegocios } from "@/actions/negocios/listar-negocios";
import { MisNegociosMenu } from "@/components/mis-negocios-menu";
import { useNegocioActivoStore } from "@/stores/negocio-activo.store";

const negocios = [
  {
    id: "negocio-1",
    cuentaId: "cuenta-1",
    nombre: "Negocio Uno",
    tipo: "MIXTO" as const,
    estado: "ACTIVO" as const,
    logoUrl: null,
    createdAt: new Date(),
    archivedAt: null,
  },
  {
    id: "negocio-2",
    cuentaId: "cuenta-1",
    nombre: "Negocio Dos",
    tipo: "MIXTO" as const,
    estado: "ACTIVO" as const,
    logoUrl: null,
    createdAt: new Date(),
    archivedAt: null,
  },
];

describe("MisNegociosMenu", () => {
  beforeEach(() => {
    useNegocioActivoStore.setState({ negocioActivoId: null, negocioActivoTipo: null });
    vi.mocked(listarNegocios).mockResolvedValue({ ok: true, data: negocios });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cambia negocioActivoId en el store al elegir otro negocio", async () => {
    const user = userEvent.setup();
    render(<MisNegociosMenu />);

    await waitFor(() => expect(useNegocioActivoStore.getState().negocioActivoId).toBe("negocio-1"));

    await user.click(screen.getByRole("button", { name: /negocio uno/i }));
    await user.click(screen.getByRole("button", { name: "Negocio Dos" }));

    expect(useNegocioActivoStore.getState().negocioActivoId).toBe("negocio-2");
  });
});
