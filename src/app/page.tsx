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
  RadioTower,
  Server,
  Shield,
  Swords,
  UserRound,
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  agents,
  defaultLeftAgent,
  defaultRightAgent,
  defaultTask,
  getAgent,
  getTask,
  isAgentId,
  isTaskId,
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

  function launchMatch() {
    const params = new URLSearchParams({
      left: leftAgent,
      right: rightAgent,
      task: taskId,
      match: crypto.randomUUID(),
    })

    sessionStorage.setItem(
      "thunderdome.key-presence",
      JSON.stringify(keyPresence)
    )

    router.push(`/arena?${params.toString()}`)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="thunder-shell min-h-screen">
        <header className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs uppercase text-primary">
              <Swords className="size-4" />
              agent deathmatch arena
            </div>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              THUNDERDOME
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-md border-cyan-300/40 bg-cyan-300/10 text-cyan-100">
              <Server data-icon="inline-start" />
              Vercel / Next
            </Badge>
            <Badge className="rounded-md border-amber-300/40 bg-amber-300/10 text-amber-100">
              <RadioTower data-icon="inline-start" />
              live sandbox stream
            </Badge>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 pb-8 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)] lg:px-8">
          <div className="rounded-md border border-border bg-card/90 p-4 shadow-[0_18px_80px_rgba(0,0,0,0.34)] sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase text-muted-foreground">
                  Match Builder
                </p>
                <h2 className="text-2xl font-semibold tracking-normal text-foreground">
                  Choose the contenders
                </h2>
              </div>
              <Badge className="rounded-md" variant={sameAgent ? "destructive" : "default"}>
                <CircleDot data-icon="inline-start" />
                {sameAgent ? "mirror match" : "pair armed"}
              </Badge>
            </div>

            <form
              className="mt-5 grid gap-5"
              onSubmit={(event) => {
                event.preventDefault()
                launchMatch()
              }}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)]">
                <AgentSelector label="Left Agent" value={leftAgent} onChange={setLeftAgent} />
                <div className="hidden items-end justify-center pb-2 lg:flex">
                  <div className="flex size-12 items-center justify-center rounded-md border border-border bg-background/70">
                    <Swords className="size-5 text-primary" />
                  </div>
                </div>
                <AgentSelector label="Right Agent" value={rightAgent} onChange={setRightAgent} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <AgentSummary agent={left} />
                <AgentSummary agent={right} />
              </div>

              <Separator />

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
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
                    <SelectTrigger id="task" className="h-10 w-full rounded-md">
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
                <div className="rounded-md border border-border bg-background/70 p-3">
                  <p className="font-mono text-xs uppercase text-muted-foreground">
                    Win Condition
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground">{task.winCondition}</p>
                </div>
              </div>

              <div className="rounded-md border border-border bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs uppercase text-muted-foreground">
                      Provider Keys
                    </p>
                    <h3 className="text-lg font-semibold text-foreground">Sandbox credentials</h3>
                  </div>
                  <Badge className="rounded-md border-teal-300/40 bg-teal-300/10 text-teal-100">
                    <KeyRound data-icon="inline-start" />
                    {keyCount} configured
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                <p className="text-sm text-muted-foreground">{task.objective}</p>
                <Button
                  type="submit"
                  size="lg"
                  className="h-11 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Zap data-icon="inline-start" />
                  Launch match
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </form>
          </div>

          <aside className="grid gap-4">
            <div className="arena-plating min-h-[280px] rounded-md border border-border bg-card/80 p-4 shadow-[0_18px_80px_rgba(0,0,0,0.3)]">
              <div className="flex h-full min-h-[240px] flex-col justify-between">
                <div>
                  <p className="font-mono text-xs uppercase text-muted-foreground">
                    Arena Map
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-foreground">Shared sandbox</h2>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <ArenaNode agent={left} label="A" />
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-12 w-px bg-border" />
                    <Shield className="size-6 text-primary" />
                    <div className="h-12 w-px bg-border" />
                  </div>
                  <ArenaNode agent={right} label="B" />
                </div>
              </div>
            </div>

            <div className="rounded-md border border-border bg-card/90 p-4 shadow-[0_18px_80px_rgba(0,0,0,0.28)]">
              <p className="font-mono text-xs uppercase text-muted-foreground">
                Roster
              </p>
              <div className="mt-3 grid gap-2">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/70 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{agent.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.provider} / {agent.model}
                      </p>
                    </div>
                    <div
                      className="size-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: agent.accent }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <footer className="mx-auto flex w-full max-w-7xl flex-col gap-3 border-t border-border/70 px-4 py-5 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>
            Made by{" "}
            <a
              href="https://jay.ai"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Jay Hack
            </a>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/about"
              className="inline-flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline"
            >
              <UserRound className="size-4" />
              About
            </Link>
          </div>
        </footer>
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
            {agents.slice(0, 3).map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            {agents.slice(3).map((agent) => (
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
    <div className="rounded-md border border-border bg-background/70 p-4">
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
      <div className="mt-3 flex flex-wrap gap-2">
        {agent.strengths.map((strength) => (
          <Badge key={strength} variant="outline" className="rounded-md">
            {strength}
          </Badge>
        ))}
      </div>
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

function ArenaNode({ agent, label }: { agent: AgentDefinition; label: string }) {
  return (
    <div className="rounded-md border border-border bg-background/75 p-3">
      <div
        className="mb-3 flex size-10 items-center justify-center rounded-md font-mono text-sm font-semibold text-background"
        style={{ backgroundColor: agent.accent }}
      >
        {label}
      </div>
      <p className="truncate text-sm font-medium text-foreground">{agent.callsign}</p>
      <p className="truncate text-xs text-muted-foreground">{agent.provider}</p>
    </div>
  )
}
