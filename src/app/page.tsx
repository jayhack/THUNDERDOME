"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  KeyRound,
  LoaderCircle,
  Swords,
  XCircle,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ThunderdomeLogo } from "@/components/thunderdome-logo"
import {
  defaultLeftAgent,
  defaultRightAgent,
  defaultTask,
  getAgent,
  getTask,
  isAgentId,
  isTaskId,
  realArenaAgents,
  tasks,
  type AgentDefinition,
  type AgentId,
  type TaskId,
} from "@/lib/arena-data"
import {
  type ProviderId,
  type ProviderTestResult,
  type ProviderTestStatus,
} from "@/lib/provider-tests"
import { type SecretPresence } from "@/lib/server-secrets"

type KeyState = {
  openai: string
  anthropic: string
  moonshot: string
  e2b: string
}

type CredentialSessionResponse = {
  credentialSession?: string
  message?: string
}

const emptyKeys: KeyState = {
  openai: "",
  anthropic: "",
  moonshot: "",
  e2b: "",
}

const emptySecretPresence: SecretPresence = {
  openai: false,
  anthropic: false,
  moonshot: false,
  e2b: false,
}

const initialProviderStatuses: Record<ProviderId, ProviderTestStatus> = {
  openai: "idle",
  anthropic: "unsupported",
  moonshot: "idle",
  e2b: "idle",
}

const providerCheckingMessages: Record<ProviderId, string> = {
  openai: "Checking OpenAI key...",
  anthropic: "",
  moonshot: "Checking Kimi key...",
  e2b: "Starting E2B sandbox...",
}

function canValidateProvider(provider: ProviderId) {
  return provider !== "anthropic"
}

export default function Home() {
  const router = useRouter()
  const [leftAgent, setLeftAgent] = useState<AgentId>(defaultLeftAgent)
  const [rightAgent, setRightAgent] = useState<AgentId>(defaultRightAgent)
  const [taskId, setTaskId] = useState<TaskId>(defaultTask)
  const [keys, setKeys] = useState<KeyState>(emptyKeys)
  const [localSecrets, setLocalSecrets] = useState<SecretPresence>(emptySecretPresence)
  const [providerStatuses, setProviderStatuses] =
    useState<Record<ProviderId, ProviderTestStatus>>(initialProviderStatuses)
  const [providerMessages, setProviderMessages] = useState<Partial<Record<ProviderId, string>>>({})
  const [isLaunching, setIsLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)

  const left = getAgent(leftAgent)
  const right = getAgent(rightAgent)
  const task = getTask(taskId)
  const sameAgent = leftAgent === rightAgent
  const { openai: openaiKey, moonshot: moonshotKey, e2b: e2bKey } = keys
  const {
    openai: localOpenAiConfigured,
    moonshot: localMoonshotConfigured,
    e2b: localE2bConfigured,
  } = localSecrets
  const keyPresence = useMemo(
    () => ({
      openai: keys.openai.trim().length > 0 || localSecrets.openai,
      anthropic: keys.anthropic.trim().length > 0 || localSecrets.anthropic,
      moonshot: keys.moonshot.trim().length > 0 || localSecrets.moonshot,
      e2b: keys.e2b.trim().length > 0 || localSecrets.e2b,
    }),
    [keys, localSecrets]
  )
  const keyCount = Object.values(keyPresence).filter(Boolean).length

  useEffect(() => {
    let cancelled = false

    async function loadSecretPresence() {
      const response = await fetch("/api/config/secrets", {
        cache: "no-store",
      })

      if (!response.ok) {
        return
      }

      const payload = (await response.json()) as { secrets?: SecretPresence }

      if (!cancelled && payload.secrets) {
        setLocalSecrets(payload.secrets)
      }
    }

    loadSecretPresence().catch(() => {
      if (!cancelled) {
        setLocalSecrets(emptySecretPresence)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function testProvider(provider: ProviderId, key?: string) {
    if (!canValidateProvider(provider)) {
      setProviderStatuses((current) => ({ ...current, [provider]: "unsupported" }))
      setProviderMessages((current) => ({ ...current, [provider]: undefined }))
      return
    }

    setProviderStatuses((current) => ({ ...current, [provider]: "checking" }))
    setProviderMessages((current) => ({
      ...current,
      [provider]: providerCheckingMessages[provider],
    }))

    try {
      const response = await fetch("/api/provider-tests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider, key }),
      })
      const payload = (await response.json()) as ProviderTestResult

      setProviderStatuses((current) => ({ ...current, [provider]: payload.status }))
      setProviderMessages((current) => ({
        ...current,
        [provider]: formatProviderMessage(payload),
      }))
    } catch {
      setProviderStatuses((current) => ({ ...current, [provider]: "error" }))
      setProviderMessages((current) => ({
        ...current,
        [provider]: "Could not reach local validation endpoint.",
      }))
    }
  }

  useEffect(() => {
    const testableProviders: Array<{
      provider: ProviderId
      key: string
      localConfigured: boolean
    }> = [
      { provider: "openai", key: openaiKey, localConfigured: localOpenAiConfigured },
      { provider: "moonshot", key: moonshotKey, localConfigured: localMoonshotConfigured },
      { provider: "e2b", key: e2bKey, localConfigured: localE2bConfigured },
    ]

    const timeouts = testableProviders.flatMap(({ provider, key, localConfigured }) => {
      const trimmedKey = key.trim()

      if (!trimmedKey || localConfigured) {
        return []
      }

      return [
        window.setTimeout(() => {
          testProvider(provider, trimmedKey)
        }, 900),
      ]
    })

    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout))
    }
  }, [
    e2bKey,
    localE2bConfigured,
    localMoonshotConfigured,
    localOpenAiConfigured,
    moonshotKey,
    openaiKey,
  ])

  function updateProviderKey(provider: ProviderId, value: string) {
    setLaunchError(null)
    setKeys((current) => ({ ...current, [provider]: value }))

    if (!value.trim()) {
      setProviderStatuses((current) => ({
        ...current,
        [provider]: initialProviderStatuses[provider],
      }))
      setProviderMessages((current) => ({ ...current, [provider]: undefined }))
      return
    }

    setProviderStatuses((current) => ({ ...current, [provider]: "idle" }))
    setProviderMessages((current) => ({ ...current, [provider]: undefined }))
  }

  async function launchMatch() {
    setLaunchError(null)

    const params = new URLSearchParams({
      left: leftAgent,
      right: rightAgent,
      task: taskId,
      match: crypto.randomUUID(),
    })
    const typedCredentials = trimKeyState(keys)
    const hasOpenAiCredential = Boolean(localSecrets.openai || typedCredentials.openai)
    const hasE2bCredential = Boolean(localSecrets.e2b || typedCredentials.e2b)

    if (!hasOpenAiCredential || !hasE2bCredential) {
      setLaunchError("OpenAI and E2B keys are required for a real Codex arena match.")
      return
    }

    setIsLaunching(true)

    try {
      if (Object.keys(typedCredentials).length > 0) {
        const response = await fetch("/api/config/credentials", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ keys: typedCredentials }),
        })
        const payload = (await response.json().catch(() => ({}))) as CredentialSessionResponse

        if (!response.ok || !payload.credentialSession) {
          throw new Error(payload.message ?? "Could not prepare local credentials.")
        }

        params.set("credentials", payload.credentialSession)
      }

      sessionStorage.setItem(
        "thunderdome.key-presence",
        JSON.stringify(keyPresence)
      )

      router.push(`/arena?${params.toString()}`)
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : "Could not launch match.")
      setIsLaunching(false)
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="thunder-shell min-h-dvh">
        <header className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              href="/design"
              aria-label="THUNDERDOME design system"
              className="arena-plating flex size-16 shrink-0 items-center justify-center rounded-sm border border-border bg-card shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
            >
              <ThunderdomeLogo showWordmark={false} className="size-12" />
            </Link>
            <div>
              <div className="flex items-center gap-2 font-mono text-xs uppercase text-primary">
                <Swords className="size-4" />
                agent deathmatch arena
              </div>
              <h1 className="mt-1 text-4xl font-black uppercase tracking-normal text-foreground sm:text-5xl">
                THUNDERDOME
              </h1>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <a
              href="https://github.com/jayhack/THUNDERDOME"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-sm border border-[#343a40] bg-[#050505]/80 px-3 text-sm font-medium text-foreground transition-colors hover:border-cyan-300/50 hover:bg-cyan-300/10"
            >
              GitHub
            </a>
            <Link
              href="/about"
              className="inline-flex h-9 items-center justify-center rounded-sm border border-[#343a40] bg-[#050505]/80 px-3 text-sm font-medium text-foreground transition-colors hover:border-cyan-300/50 hover:bg-cyan-300/10"
            >
              About
            </Link>
          </nav>
        </header>

        <section className="mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6 lg:px-8">
          <div className="rounded-sm border border-[#343a40] bg-[#050505]/95 p-4 shadow-[0_18px_80px_rgba(0,0,0,0.58)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-normal text-foreground">
                  Choose the contenders
                </h2>
              </div>
              <Badge
                className={
                  sameAgent
                    ? "rounded-sm"
                    : "rounded-sm border-cyan-300/45 bg-cyan-300/15 text-cyan-100"
                }
                variant={sameAgent ? "destructive" : "outline"}
              >
                <CircleDot data-icon="inline-start" />
                {sameAgent ? "mirror match" : "pair armed"}
              </Badge>
            </div>

            <form
              className="mt-5 grid gap-5"
              onSubmit={(event) => {
                event.preventDefault()
                void launchMatch()
              }}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] lg:items-stretch">
                <div className="grid gap-3">
                  <AgentSelector label="Left Agent" value={leftAgent} onChange={setLeftAgent} />
                  <AgentSummary agent={left} />
                </div>
                <div className="hidden items-center justify-center lg:flex">
                  <div className="flex size-12 items-center justify-center rounded-sm border border-[#343a40] bg-[#090909]">
                    <Swords className="size-5 text-primary" />
                  </div>
                </div>
                <div className="grid gap-3">
                  <AgentSelector label="Right Agent" value={rightAgent} onChange={setRightAgent} />
                  <AgentSummary agent={right} />
                </div>
              </div>

              <Separator />

              <div className="grid gap-3 rounded-sm border border-[#343a40] bg-[#090909]/80 p-3 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)] md:items-end">
                <div className="grid gap-2">
                  <Label htmlFor="task">Arena Task</Label>
                  <Select
                    value={taskId}
                    onValueChange={(value) => {
                      if (isTaskId(value)) {
                        setTaskId(value)
                      }
                    }}
                  >
                    <SelectTrigger id="task" className="h-10 w-full rounded-sm bg-card/75">
                      <SelectValue placeholder="Select task">
                        {(value) => getTask(value).name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectGroup>
                        <SelectLabel>Tasks</SelectLabel>
                        {tasks.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-h-10 gap-1 rounded-sm border border-border bg-card/75 px-3 py-2">
                  <p className="font-mono text-xs uppercase text-muted-foreground">
                    Win Condition
                  </p>
                  <p className="text-sm leading-5 text-foreground">{task.winCondition}</p>
                </div>
              </div>

              <div className="rounded-sm border border-[#343a40] bg-[#090909]/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs uppercase text-muted-foreground">
                      Provider Keys
                    </p>
                    <h3 className="text-lg font-semibold text-foreground">Sandbox credentials</h3>
                  </div>
                  <Badge className="rounded-sm border-cyan-300/40 bg-cyan-300/10 text-cyan-100">
                    <KeyRound data-icon="inline-start" />
                    {keyCount} configured
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <KeyInput
                    id="openai"
                    label="OpenAI"
                    value={keys.openai}
                    localConfigured={localSecrets.openai}
                    status={providerStatuses.openai}
                    statusMessage={providerMessages.openai}
                    validationEnabled={canValidateProvider("openai")}
                    onTest={() => testProvider("openai", keys.openai.trim() || undefined)}
                    onChange={(openai) => updateProviderKey("openai", openai)}
                  />
                  <KeyInput
                    id="anthropic"
                    label="Anthropic"
                    value={keys.anthropic}
                    localConfigured={localSecrets.anthropic}
                    status={providerStatuses.anthropic}
                    statusMessage={providerMessages.anthropic}
                    validationEnabled={canValidateProvider("anthropic")}
                    onTest={() =>
                      testProvider("anthropic", keys.anthropic.trim() || undefined)
                    }
                    onChange={(anthropic) => updateProviderKey("anthropic", anthropic)}
                  />
                  <KeyInput
                    id="moonshot"
                    label="Moonshot / Kimi"
                    value={keys.moonshot}
                    localConfigured={localSecrets.moonshot}
                    status={providerStatuses.moonshot}
                    statusMessage={providerMessages.moonshot}
                    validationEnabled={canValidateProvider("moonshot")}
                    onTest={() =>
                      testProvider("moonshot", keys.moonshot.trim() || undefined)
                    }
                    onChange={(moonshot) => updateProviderKey("moonshot", moonshot)}
                  />
                  <KeyInput
                    id="e2b"
                    label="E2B"
                    value={keys.e2b}
                    localConfigured={localSecrets.e2b}
                    status={providerStatuses.e2b}
                    statusMessage={providerMessages.e2b}
                    validationEnabled={canValidateProvider("e2b")}
                    onTest={() => testProvider("e2b", keys.e2b.trim() || undefined)}
                    onChange={(e2b) => updateProviderKey("e2b", e2b)}
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Values in `.env.local` stay server-side. This screen only checks whether each
                  provider is configured.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid gap-1">
                  <p className="text-sm text-muted-foreground">{task.objective}</p>
                  {launchError ? (
                    <p className="text-sm text-destructive">{launchError}</p>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="h-11 rounded-sm bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={isLaunching}
                >
                  {isLaunching ? (
                    <LoaderCircle className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <Zap data-icon="inline-start" />
                  )}
                  {isLaunching ? "Launching" : "Launch match"}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}

function AgentSelector({
  label,
  value,
  onChange,
}: {
  label: string
  value: AgentId
  onChange: (value: AgentId) => void
}) {
  const id = `${label.toLowerCase().replaceAll(" ", "-")}-select`

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (isAgentId(nextValue)) {
            onChange(nextValue)
          }
        }}
      >
        <SelectTrigger id={id} className="h-10 w-full rounded-md">
          <SelectValue placeholder="Select agent">
            {(nextValue) => getAgent(nextValue).name}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>
            <SelectLabel>Agents</SelectLabel>
            {realArenaAgents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

function AgentSummary({ agent }: { agent: AgentDefinition }) {
  return (
    <div className="min-h-40 rounded-sm border border-[#343a40] bg-[#050505]/90 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs uppercase text-muted-foreground">
            {agent.callsign}
          </p>
          <h3 className="truncate text-lg font-semibold text-foreground">{agent.name}</h3>
        </div>
        <span
          className="mt-1 size-4 shrink-0 rounded-sm"
          style={{ backgroundColor: agent.accent }}
        />
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{agent.profile}</p>
    </div>
  )
}

function KeyInput({
  id,
  label,
  value,
  localConfigured,
  status,
  statusMessage,
  validationEnabled,
  onTest,
  onChange,
}: {
  id: keyof KeyState
  label: string
  value: string
  localConfigured: boolean
  status: ProviderTestStatus
  statusMessage?: string
  validationEnabled: boolean
  onTest: () => void
  onChange: (value: string) => void
}) {
  const isChecking = status === "checking"
  const hasKey = localConfigured || value.trim().length > 0
  const inputDisabled = localConfigured || !validationEnabled
  const testDisabled = isChecking || !validationEnabled || !hasKey

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input
          id={id}
          value={value}
          type="password"
          autoComplete="off"
          className="h-10 rounded-md"
          disabled={inputDisabled}
          placeholder={localConfigured ? "loaded from .env.local" : "key"}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-md"
          disabled={testDisabled}
          onClick={onTest}
        >
          {isChecking ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
          Test
        </Button>
      </div>
      <ProviderStatusLine status={status} message={statusMessage} />
    </div>
  )
}

function ProviderStatusLine({
  status,
  message,
}: {
  status: ProviderTestStatus
  message?: string
}) {
  if (status === "valid") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-200">
        <CheckCircle2 className="size-3.5" />
        {message ?? "Key works."}
      </p>
    )
  }

  if (status === "invalid" || status === "error" || status === "missing") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-destructive">
        <XCircle className="size-3.5" />
        {message ?? "Key check failed."}
      </p>
    )
  }

  if (status === "checking") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        {message ?? "Checking key..."}
      </p>
    )
  }

  return null
}

function formatProviderMessage(payload: ProviderTestResult): string {
  if (!payload.latencyMs) {
    return payload.message
  }

  return `${payload.message} (${payload.latencyMs}ms)`
}

function trimKeyState(keys: KeyState): Partial<Record<ProviderId, string>> {
  return Object.fromEntries(
    Object.entries(keys)
      .map(([provider, value]) => [provider, value.trim()])
      .filter((entry): entry is [ProviderId, string] => Boolean(entry[1]))
  )
}
