import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const { apiKey, baseURL, model } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey,
      ...(baseURL && { baseURL }),
    });

    const selectedModel = model || "gpt-4o-mini";

    // Try with response_format, fall back without
    try {
      const completion = await openai.chat.completions.create({
        model: selectedModel,
        messages: [{ role: "user", content: "Reply with exactly: {\"status\":\"ok\"}" }],
        response_format: { type: "json_object" },
        max_tokens: 10,
      });
      return NextResponse.json({
        ok: true,
        message: `Connected using ${selectedModel}. Response: ${completion.choices[0].message.content}`,
      });
    } catch {
      const completion = await openai.chat.completions.create({
        model: selectedModel,
        messages: [{ role: "user", content: "Reply with exactly: {\"status\":\"ok\"}" }],
        max_tokens: 10,
      });
      return NextResponse.json({
        ok: true,
        message: `Connected using ${selectedModel} (no json_object support). Response: ${completion.choices[0].message.content}`,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
