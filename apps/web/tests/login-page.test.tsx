// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/auth/sign-in", () => ({
  signIn: vi.fn(),
}));

import LoginPage from "@/app/(auth)/login/page";
import { signIn } from "@/actions/auth/sign-in";

describe("LoginPage", () => {
  it("muestra un mensaje de error genérico ante credenciales inválidas (AC4)", async () => {
    vi.mocked(signIn).mockResolvedValue({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Credenciales inválidas.",
        requestId: "test",
        timestamp: new Date().toISOString(),
      },
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "no-existe@ejemplo.com");
    await user.type(screen.getByLabelText(/contraseña/i), "cualquiera");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByText("Credenciales inválidas.")).toBeInTheDocument();
  });
});
