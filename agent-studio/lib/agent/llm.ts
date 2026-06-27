import { GoogleGenAI, Type, FunctionCallingConfigMode } from "@google/genai";
import { OP_NAMES } from "../twick/ops";

/**
 * Provider-agnostic LLM seam.
 *
 * The agent emits edits via a single "tool" — `emit_operations` — whose
 * arguments are `{ reasoning, ops }`. This mirrors Claude tool-use exactly, so
 * swapping Gemini → Claude is a matter of adding a sibling provider; nothing
 * upstream (run-agent, the route, the client) changes.
 *
 * Validation of `ops` against the real Zod contract happens in `run-agent.ts`,
 * NOT here — the provider only needs to coax the model into the tool shape.
 */
export interface LlmResult {
  /** The raw object the model passed as the tool's arguments. */
  object: unknown;
  /** Provider id for logging. */
  provider: string;
}

export interface LlmProvider {
  readonly name: string;
  generateAgentResponse(input: {
    system: string;
    user: string;
    /** Optional per-call model override for the cost cascade (see model-router). */
    model?: string;
  }): Promise<LlmResult>;
}

const TOOL_NAME = "emit_operations";

/**
 * Loose tool schema: `op` is constrained to the known names and the fields the
 * ops may use are declared, but everything except `op` is optional. Zod does the
 * strict, per-op validation downstream. This keeps us inside what Gemini's
 * function-declaration schema reliably supports (no discriminated unions).
 */
const emitOperationsDeclaration = {
  name: TOOL_NAME,
  description:
    "Emit the ordered list of timeline operations that satisfy the user's request, plus a short reasoning.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reasoning: {
        type: Type.STRING,
        description: "One or two sentences explaining what you are about to change and why.",
      },
      ops: {
        type: Type.ARRAY,
        description: "Ordered operations to apply. Empty if no change is needed.",
        items: {
          type: Type.OBJECT,
          properties: {
            op: { type: Type.STRING, enum: [...OP_NAMES] },
            text: { type: Type.STRING },
            start: { type: Type.NUMBER },
            end: { type: Type.NUMBER },
            elementId: { type: Type.STRING },
            mediaType: { type: Type.STRING, enum: ["video", "image", "audio"] },
            src: { type: Type.STRING },
            time: { type: Type.NUMBER },
            fontSize: { type: Type.NUMBER },
            fill: { type: Type.STRING },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            shape: { type: Type.STRING, enum: ["rect", "circle", "icon"] },
            width: { type: Type.NUMBER },
            height: { type: Type.NUMBER },
            radius: { type: Type.NUMBER },
            toScale: { type: Type.NUMBER },
            // removeWords: indices into the caption's word list (spans are an
            // MCP-only power feature; the in-app agent uses plain indices).
            words: { type: Type.ARRAY, items: { type: Type.NUMBER } },
            cutAggressiveness: { type: Type.STRING, enum: ["tight", "balanced", "loose"] },
          },
          required: ["op"],
        },
      },
    },
    required: ["reasoning", "ops"],
  },
};

/**
 * Plain JSON-Schema (lowercase types) for OpenAI-compatible tool calling
 * (OpenRouter, BEEP, any /chat/completions gateway). Mirrors the Gemini
 * declaration above; Zod still does the strict validation downstream.
 */
const emitOperationsJsonSchema = {
  type: "object",
  properties: {
    reasoning: { type: "string", description: "One or two sentences on what you are changing and why." },
    ops: {
      type: "array",
      description: "Ordered operations to apply. Empty if no change is needed.",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: [...OP_NAMES] },
          text: { type: "string" },
          start: { type: "number" },
          end: { type: "number" },
          elementId: { type: "string" },
          mediaType: { type: "string", enum: ["video", "image", "audio"] },
          src: { type: "string" },
          time: { type: "number" },
          fontSize: { type: "number" },
          fill: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          shape: { type: "string", enum: ["rect", "circle", "icon"] },
          width: { type: "number" },
          height: { type: "number" },
          radius: { type: "number" },
          toScale: { type: "number" },
          words: { type: "array", items: { type: "number" } },
          cutAggressiveness: { type: "string", enum: ["tight", "balanced", "loose"] },
        },
        required: ["op"],
      },
    },
  },
  required: ["reasoning", "ops"],
};

/**
 * OpenAI-compatible chat-completions provider (OpenRouter by default). Uses
 * forced function-calling on the `emit_operations` tool — same contract as the
 * Gemini path. Base URL is configurable so any OpenAI-shaped gateway works.
 */
class OpenRouterProvider implements LlmProvider {
  readonly name: string;
  constructor(
    private apiKey: string,
    private model: string,
    private baseUrl: string,
    name = "openrouter"
  ) {
    this.name = name;
  }

  async generateAgentResponse(input: {
    system: string;
    user: string;
    model?: string;
  }): Promise<LlmResult> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        // Optional OpenRouter attribution headers (ignored by other gateways).
        "HTTP-Referer": "https://localhost/agent-studio",
        "X-Title": "Antigravity for Video",
      },
      body: JSON.stringify({
        model: input.model ?? this.model,
        temperature: 0,
        // Cap output so the request doesn't reserve the model's full context up
        // front (op lists are tiny); also keeps cost/credit reservation low.
        max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS ?? 2048),
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: TOOL_NAME,
              description:
                "Emit the ordered list of timeline operations that satisfy the user's request, plus a short reasoning.",
              parameters: emitOperationsJsonSchema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: TOOL_NAME } },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${this.name} returned ${response.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
    };
    const call = data.choices?.[0]?.message?.tool_calls?.[0]?.function;
    if (!call || call.name !== TOOL_NAME || !call.arguments) {
      throw new Error(`${this.name} did not return an ${TOOL_NAME} tool call`);
    }
    let object: unknown;
    try {
      object = JSON.parse(call.arguments);
    } catch {
      throw new Error(`${this.name} returned non-JSON tool arguments`);
    }
    return { object, provider: this.name };
  }
}

class GeminiProvider implements LlmProvider {
  readonly name: string;
  private ai: GoogleGenAI;
  private model: string;

  constructor(ai: GoogleGenAI, model: string, name = "gemini") {
    this.ai = ai;
    this.model = model;
    this.name = name;
  }

  async generateAgentResponse(input: {
    system: string;
    user: string;
    model?: string;
  }): Promise<LlmResult> {
    const response = await this.ai.models.generateContent({
      model: input.model ?? this.model,
      contents: [{ role: "user", parts: [{ text: input.user }] }],
      config: {
        systemInstruction: input.system,
        temperature: 0,
        tools: [{ functionDeclarations: [emitOperationsDeclaration] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: [TOOL_NAME],
          },
        },
      },
    });

    const call = response.functionCalls?.[0];
    if (!call || call.name !== TOOL_NAME || !call.args) {
      throw new Error(
        `Gemini did not return an ${TOOL_NAME} tool call (got: ${response.text ?? "nothing"})`
      );
    }
    return { object: call.args, provider: this.name };
  }
}

/**
 * Resolve the active provider from the environment.
 * - Vertex AI (uses gcloud ADC, no API key): LLM_PROVIDER=vertex or GOOGLE_GENAI_USE_VERTEXAI=true,
 *   with GOOGLE_CLOUD_PROJECT (+ optional GOOGLE_CLOUD_LOCATION).
 * - Gemini Developer API: GEMINI_API_KEY.
 * - A ClaudeProvider (same interface) plugs in when ANTHROPIC_API_KEY is set and LLM_PROVIDER=claude.
 */
export const getProvider = (): LlmProvider => {
  const preferred = process.env.LLM_PROVIDER?.toLowerCase();
  const useVertex = preferred === "vertex" || process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";

  // OpenRouter (OpenAI-compatible). Default when an OPENROUTER_API_KEY is present.
  if (preferred === "openrouter" || (!preferred && process.env.OPENROUTER_API_KEY)) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("LLM_PROVIDER=openrouter requires OPENROUTER_API_KEY.");
    const model = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
    const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
    return new OpenRouterProvider(apiKey, model, baseUrl);
  }

  // BEEP or any other OpenAI-compatible gateway (needs an explicit base URL).
  if (preferred === "beep") {
    const apiKey = process.env.BEEP_API_KEY;
    const baseUrl = process.env.BEEP_BASE_URL ?? process.env.OPENROUTER_BASE_URL;
    if (!apiKey || !baseUrl) {
      throw new Error("LLM_PROVIDER=beep requires BEEP_API_KEY and BEEP_BASE_URL (OpenAI-compatible endpoint).");
    }
    const model = process.env.BEEP_MODEL ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
    return new OpenRouterProvider(apiKey, model, baseUrl, "beep");
  }

  if (preferred === "claude" || (!preferred && process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY && !useVertex)) {
    throw new Error(
      "Claude provider not implemented yet. Use LLM_PROVIDER=gemini (GEMINI_API_KEY) or " +
        "LLM_PROVIDER=vertex (gcloud ADC), or add a ClaudeProvider in lib/agent/llm.ts."
    );
  }

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  if (useVertex) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) {
      throw new Error("LLM_PROVIDER=vertex requires GOOGLE_CLOUD_PROJECT (and gcloud ADC).");
    }
    const location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
    const ai = new GoogleGenAI({ vertexai: true, project, location });
    return new GeminiProvider(ai, model, "vertex");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("No LLM credential — set GEMINI_API_KEY, or LLM_PROVIDER=vertex with gcloud ADC.");
  }
  return new GeminiProvider(new GoogleGenAI({ apiKey }), model);
};
