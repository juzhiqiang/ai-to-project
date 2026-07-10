import { NextResponse } from "next/server";

const DEFAULT_API_ORIGIN = "http://127.0.0.1:3001";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const apiOrigin = process.env.API_ORIGIN ?? DEFAULT_API_ORIGIN;
  const contentType = request.headers.get("content-type") ?? "application/json";
  const body = await request.text();

  try {
    const response = await fetch(`${apiOrigin}/api/agents/plan-execute`, {
      method: "POST",
      headers: {
        "content-type": contentType,
      },
      body,
      cache: "no-store",
    });
    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Backend plan execute request failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
