import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
  checkDatabaseHealth: vi.fn(),
}));

import { checkDatabaseHealth } from "@repo/database";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("responde 200 con database: connected cuando la DB responde", async () => {
    vi.mocked(checkDatabaseHealth).mockResolvedValue(true);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("connected");
    expect(typeof body.timestamp).toBe("string");
  });

  it("responde 503 cuando la base de datos no responde", async () => {
    vi.mocked(checkDatabaseHealth).mockResolvedValue(false);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.database).toBe("disconnected");
  });
});
