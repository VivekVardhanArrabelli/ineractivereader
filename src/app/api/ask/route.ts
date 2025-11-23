import { NextRequest, NextResponse } from "next/server";

type GrokResponse =
  | {
      choices?: Array<{
        message?: {
          content?:
            | string
            | Array<{ text?: string; type?: string; [key: string]: unknown }>;
        };
      }>;
      output?: Array<{
        content?: Array<{ text?: string }>;
      }>;
      output_text?: string | string[];
    }
  | Record<string, unknown>;

const FALLBACK_MESSAGE =
  "Set the GROK_API_KEY environment variable to proxy questions to Grok 4.1. You're seeing a local demo response instead.";

export async function POST(request: NextRequest) {
  const { question, context } = await request.json();

  if (!question?.trim()) {
    return NextResponse.json(
      { error: "Please include a question in your request." },
      { status: 400 },
    );
  }

  const apiKey = process.env.GROK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      answer: FALLBACK_MESSAGE,
      offline: true,
    });
  }

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.1",
        temperature: 0.25,
        max_output_tokens: 600,
        messages: [
          {
            role: "system",
            content:
              "You are ChapterPal, an on-device reading coach. Be concise, cite relevant parts of the provided excerpt, and suggest the next curiosity-driven step when helpful.",
          },
          {
            role: "user",
            content: `Excerpt:\n${context || "No excerpt provided."}\n\nQuestion: ${question}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(
        (errorPayload as { error?: string }).error ||
          `Grok API returned HTTP ${response.status}`,
      );
    }

    const answer = await normalizeGrokResponse(response);
    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while calling Grok 4.1.",
      },
      { status: 500 },
    );
  }
}

async function normalizeGrokResponse(response: Response) {
  const data = (await response.json()) as GrokResponse;
  const primary = data?.choices?.[0]?.message?.content;

  if (typeof primary === "string") {
    return primary;
  }

  if (Array.isArray(primary)) {
    return primary.map((chunk) => chunk?.text ?? "").join("\n");
  }

  const outputBlocks = data?.output?.[0]?.content;
  if (Array.isArray(outputBlocks)) {
    return outputBlocks.map((chunk) => chunk?.text ?? "").join("\n");
  }

  const outputText = data?.output_text;
  if (Array.isArray(outputText)) {
    return outputText.join("\n");
  }

  if (typeof outputText === "string") {
    return outputText;
  }

  return "Grok responded without readable text.";
}
