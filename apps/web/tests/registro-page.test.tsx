// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/actions/auth/sign-up", () => ({
  signUp: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import RegistroPage from "@/app/(auth)/registro/page";

describe("RegistroPage", () => {
  it("valida los campos requeridos sin llamar al server", async () => {
    const { signUp } = await import("@/actions/auth/sign-up");
    const user = userEvent.setup();
    render(<RegistroPage />);

    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(signUp).not.toHaveBeenCalled();
  });
});
