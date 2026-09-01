import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@repo/database";

export async function GET() {
  const isConnected = await checkDatabaseHealth();

  if (!isConnected) {
    return NextResponse.json(
      { status: "error", database: "disconnected" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: "ok",
    database: "connected",
    timestamp: new Date().toISOString(),
  });
}
