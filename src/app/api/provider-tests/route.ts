import { Sandbox } from "e2b"

import {
  type ProviderId,
  type ProviderTestResult,
  type ProviderTestStatus,
} from "@/lib/provider-tests"
import { getSecretValue } from "@/lib/server-secrets"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type ProviderTestRequest = {
  provider?: ProviderId
  key?: string
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  const body = (await request.json().catch(() => ({}))) as ProviderTestRequest
  const provider = body.provider

  if (!provider || !["openai", "anthropic", "moonshot", "e2b"].includes(provider)) {
    return Response.json(result("e2b", "unsupported", "Unknown provider."), { status: 400 })
  }

  if (provider === "anthropic") {
    return Response.json(
      result(provider, "unsupported", "Anthropic validation is not implemented yet."),
      { status: 400 }
    )
  }

  const apiKey = body.key?.trim() || getProviderKey(provider)

  if (!apiKey) {
    return Response.json(result(provider, "missing", `No ${providerLabel(provider)} key is configured.`), {
      status: 400,
    })
  }

  try {
    const test = await testProviderKey(provider, apiKey)

    return Response.json({
      ...result(provider, "valid", test.message),
      latencyMs: Date.now() - startedAt,
    })
  } catch (error) {
    const failure = normalizeProviderFailure(provider, error)

    return Response.json(
      {
        ...result(provider, failure.status, failure.message),
        latencyMs: Date.now() - startedAt,
      },
      { status: failure.status === "invalid" ? 401 : 502 }
    )
  }
}

async function testProviderKey(
  provider: Exclude<ProviderId, "anthropic">,
  apiKey: string
): Promise<{ message: string }> {
  if (provider === "openai") {
    return testOpenAiKey(apiKey)
  }

  if (provider === "moonshot") {
    return testMoonshotKey(apiKey)
  }

  return testE2bKey(apiKey)
}

async function testOpenAiKey(apiKey: string): Promise<{ message: string }> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  await assertProviderResponse("OpenAI", response)
  const payload = (await response.json()) as { data?: unknown[] }
  const modelCount = Array.isArray(payload.data) ? payload.data.length : 0

  return { message: `OpenAI key works. ${modelCount} models visible.` }
}

async function testMoonshotKey(apiKey: string): Promise<{ message: string }> {
  const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "kimi-k2.5",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      thinking: { type: "disabled" },
    }),
  })

  await assertProviderResponse("Kimi", response)

  return { message: "Kimi key works. Test completion succeeded." }
}

async function testE2bKey(apiKey: string): Promise<{ message: string }> {
  const sandbox = await Sandbox.create({
    apiKey,
    timeoutMs: 60_000,
    requestTimeoutMs: 20_000,
    metadata: {
      app: "thunderdome",
      purpose: "provider-key-test",
    },
  })

  try {
    const running = await sandbox.isRunning({ requestTimeoutMs: 10_000 })

    if (!running) {
      throw new Error("E2B sandbox was created but did not report as running.")
    }

    return { message: `E2B key works. Sandbox ${sandbox.sandboxId.slice(0, 8)} started and stopped.` }
  } finally {
    await sandbox.kill({ requestTimeoutMs: 10_000 }).catch(() => undefined)
  }
}

async function assertProviderResponse(provider: string, response: Response) {
  if (response.ok) {
    return
  }

  let detail = ""

  try {
    const payload = (await response.json()) as { error?: { message?: string }; message?: string }
    detail = payload.error?.message ?? payload.message ?? ""
  } catch {
    detail = response.statusText
  }

  throw new ProviderHttpError(provider, response.status, detail)
}

function normalizeProviderFailure(provider: ProviderId, error: unknown): {
  status: Extract<ProviderTestStatus, "invalid" | "error">
  message: string
} {
  if (error instanceof ProviderHttpError) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: "invalid",
        message: `${providerLabel(provider)} rejected the key.`,
      }
    }

    if (
      error.status === 429 ||
      error.detail.toLowerCase().includes("quota") ||
      error.detail.toLowerCase().includes("balance") ||
      error.detail.toLowerCase().includes("billing")
    ) {
      return {
        status: "error",
        message: `${providerLabel(provider)} key reached the provider, but billing or quota blocked the test.`,
      }
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("invalid") ||
    normalized.includes("api key") ||
    normalized.includes("401") ||
    normalized.includes("403")
  ) {
    return {
      status: "invalid",
      message: `${providerLabel(provider)} rejected the key.`,
    }
  }

  return {
    status: "error",
    message: `Could not validate ${providerLabel(provider)} right now.`,
  }
}

function result(
  provider: ProviderId,
  status: Exclude<ProviderTestStatus, "idle" | "checking">,
  message: string
): ProviderTestResult {
  return {
    provider,
    status,
    message,
    checkedAt: new Date().toISOString(),
  }
}

function getProviderKey(provider: ProviderId): string | undefined {
  if (provider === "openai") {
    return getSecretValue("OPENAI_API_KEY")
  }

  if (provider === "moonshot") {
    return getSecretValue("MOONSHOT_API_KEY") ?? getSecretValue("KIMI_API_KEY")
  }

  if (provider === "e2b") {
    return getSecretValue("E2B_API_KEY")
  }

  return undefined
}

function providerLabel(provider: ProviderId): string {
  if (provider === "openai") {
    return "OpenAI"
  }

  if (provider === "moonshot") {
    return "Kimi"
  }

  if (provider === "e2b") {
    return "E2B"
  }

  return "Anthropic"
}

class ProviderHttpError extends Error {
  readonly status: number
  readonly detail: string

  constructor(provider: string, status: number, detail: string) {
    super(`${provider} request failed with ${status}${detail ? `: ${detail}` : ""}`)
    this.status = status
    this.detail = detail
  }
}
