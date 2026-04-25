export type ProviderId = "openai" | "anthropic" | "moonshot" | "e2b"

export type ProviderTestStatus =
  | "idle"
  | "checking"
  | "valid"
  | "invalid"
  | "missing"
  | "unsupported"
  | "error"

export type ProviderTestResult = {
  provider: ProviderId
  status: Exclude<ProviderTestStatus, "idle" | "checking">
  message: string
  checkedAt: string
  latencyMs?: number
}
