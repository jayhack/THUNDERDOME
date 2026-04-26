"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { type AgentDefinition, type TaskDefinition } from "@/lib/arena-data"
import { type ArenaStreamEvent, type MatchOutcome } from "@/lib/match-events"

type ArenaClientProps = {
  matchId: string
  left: AgentDefinition
  right: AgentDefinition
  task: TaskDefinition
  mode?: string
  credentialSession?: string
}

type LogEntry = {
  id: string
  at: string
  message: string
  level: "signal" | "tool" | "strike" | "guard" | "system" | "result"
  command?: string
  output?: string
}

type SideState = {
  logs: LogEntry[]
}

const initialSideState: SideState = {
  logs: [],
}

export function ArenaClient({
  matchId,
  left,
  right,
  task,
  mode,
  credentialSession,
}: ArenaClientProps) {
  const [connected, setConnected] = useState(false)
  const [phase, setPhase] = useState("boot")
  const [winner, setWinner] = useState<MatchOutcome | null>(null)
  const [systemLog, setSystemLog] = useState<LogEntry[]>([])
  const [leftState, setLeftState] = useState<SideState>(initialSideState)
  const [rightState, setRightState] = useState<SideState>(initialSideState)
  const leftEndRef = useRef<HTMLDivElement | null>(null)
  const rightEndRef = useRef<HTMLDivElement | null>(null)
  const systemEndRef = useRef<HTMLDivElement | null>(null)

  const streamUrl = useMemo(() => {
    const params = new URLSearchParams({
      left: left.id,
      right: right.id,
      task: task.id,
    })

    if (mode) {
      params.set("mode", mode)
    }

    if (credentialSession) {
      params.set("credentials", credentialSession)
    }

    return `/api/matches/${matchId}/stream?${params.toString()}`
  }, [credentialSession, left.id, matchId, mode, right.id, task.id])

  useEffect(() => {
    const eventSource = new EventSource(streamUrl)

    eventSource.onopen = () => {
      setConnected(true)
    }

    eventSource.onmessage = (message) => {
      const event = JSON.parse(message.data) as ArenaStreamEvent

      if (event.type === "match") {
        setPhase(event.phase)
        setSystemLog((current) => [
          ...current,
          toLogEntry(event.at, event.message, "system"),
        ])
      }

      if (event.type === "error") {
        setPhase("resolution")
        setSystemLog((current) => [
          ...current,
          toLogEntry(event.at, event.message, "result"),
        ])
        eventSource.close()
        setConnected(false)
      }

      if (event.type === "agent") {
        const applyEvent = (current: SideState): SideState => ({
          logs: [
            ...current.logs,
            toLogEntry(event.at, event.message, event.level, event.command, event.output),
          ],
        })

        if (event.side === "left") {
          setLeftState(applyEvent)
        } else {
          setRightState(applyEvent)
        }
      }

      if (event.type === "result") {
        setWinner(event.winner)
        setPhase("resolution")
        setSystemLog((current) => [
          ...current,
          toLogEntry(event.at, event.reason, "result"),
        ])
        eventSource.close()
        setConnected(false)
      }
    }

    eventSource.onerror = () => {
      setConnected(false)
    }

    return () => {
      eventSource.close()
    }
  }, [streamUrl])

  useEffect(() => {
    leftEndRef.current?.scrollIntoView({ block: "end" })
    rightEndRef.current?.scrollIntoView({ block: "end" })
    systemEndRef.current?.scrollIntoView({ block: "end" })
  }, [leftState.logs.length, rightState.logs.length, systemLog.length])

  return (
    <main className="h-screen overflow-hidden bg-background text-foreground">
      <div className="thunder-shell flex h-screen flex-col">
        <header className="shrink-0 border-b border-border/80 bg-background/90 backdrop-blur">
          <div className="flex h-20 w-full items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/"
                aria-label="Back to match setup"
                className={buttonVariants({ variant: "outline", size: "icon" })}
              >
                <ArrowLeft />
              </Link>
              <div className="min-w-0">
                <p className="font-mono text-xs uppercase text-muted-foreground">
                  Match {matchId.slice(0, 8)}
                </p>
                <h1 className="truncate text-2xl font-black uppercase tracking-normal text-foreground sm:text-3xl">
                  {task.name}
                </h1>
              </div>
            </div>
            <div className="shrink-0 text-right font-mono text-xs uppercase text-muted-foreground">
              <p>
                {connected ? "streaming" : winner ? (winner === "draw" ? "draw" : "complete") : "reconnecting"}
              </p>
              <p className="text-primary">{phase}</p>
            </div>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]">
          <AgentPane
            agent={left}
            side="left"
            state={leftState}
            winner={winner}
            endRef={leftEndRef}
          />
          <div className="hidden bg-border md:block" />
          <AgentPane
            agent={right}
            side="right"
            state={rightState}
            winner={winner}
            endRef={rightEndRef}
          />
        </section>

        <section className="h-56 shrink-0 border-t border-border bg-card/90">
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
              <div>
                <p className="font-mono text-xs uppercase text-muted-foreground">
                  Sandbox Control
                </p>
                <h2 className="text-base font-black uppercase text-foreground">{task.arena}</h2>
              </div>
              <p className="hidden max-w-2xl text-sm text-muted-foreground md:block">
                {task.objective}
              </p>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="grid gap-1 px-4 py-3 font-mono text-sm sm:px-6">
                {systemLog.map((entry) => (
                  <SystemLine key={entry.id} entry={entry} />
                ))}
                <div ref={systemEndRef} />
              </div>
            </ScrollArea>
          </div>
        </section>
      </div>
    </main>
  )
}

function AgentPane({
  agent,
  state,
  side,
  winner,
  endRef,
}: {
  agent: AgentDefinition
  state: SideState
  side: "left" | "right"
  winner: MatchOutcome | null
  endRef: React.RefObject<HTMLDivElement | null>
}) {
  const status = winner === "draw" ? "draw" : winner ? (winner === side ? "winner" : "offline") : "running"
  const accent =
    status === "draw" ? "var(--muted)" : side === "right" ? "var(--accent)" : agent.accent
  const signal =
    status === "draw" ? "var(--muted-foreground)" : side === "right" ? "var(--accent)" : agent.signal

  return (
    <article className="flex min-h-0 flex-col bg-background/72">
      <div
        className="h-1 shrink-0"
        style={{
          background: `linear-gradient(90deg, ${accent}, ${signal})`,
        }}
      />
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase text-muted-foreground">
            {side === "left" ? "Agent 1" : "Agent 2"}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <ProviderLogo provider={agent.provider} />
            <h2 className="truncate text-2xl font-black uppercase tracking-normal text-foreground">
              {agent.name}
            </h2>
          </div>
          <p className="mt-1 truncate font-mono text-xs uppercase text-muted-foreground">
            {agent.callsign} / {agent.provider} / {agent.model}
          </p>
        </div>
        <p className="shrink-0 font-mono text-xs uppercase" style={{ color: signal }}>
          {status}
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {state.logs.length === 0 ? (
          <div className="flex min-h-full items-center justify-center px-4 py-5 font-mono text-sm text-muted-foreground">
            <span>
              awaiting command stream
            </span>
          </div>
        ) : (
          <div className="grid gap-0">
            {state.logs.map((entry) => (
              <CommandLine key={entry.id} entry={entry} accent={accent} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </ScrollArea>
    </article>
  )
}

function ProviderLogo({ provider }: { provider: string }) {
  const normalizedProvider = provider.toLowerCase()

  if (normalizedProvider.includes("openai")) {
    return (
      <span
        aria-label="OpenAI"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm border border-border bg-[#050505] font-mono text-[0.62rem] font-black text-primary"
      >
        OAI
      </span>
    )
  }

  if (normalizedProvider.includes("anthropic")) {
    return (
      <span
        aria-label="Anthropic"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm border border-border bg-[#050505] font-mono text-sm font-black text-accent"
      >
        A
      </span>
    )
  }

  return null
}

function CommandLine({ entry, accent }: { entry: LogEntry; accent: string }) {
  return (
    <div className="border-b border-border px-4 py-5 font-mono sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-4 text-xs uppercase text-muted-foreground">
        <span>{formatTime(entry.at)}</span>
        <span style={{ color: accent }}>{entry.level}</span>
      </div>
      <p className="mb-3 text-sm leading-6 text-muted-foreground">{entry.message}</p>
      {entry.command ? (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-sm border border-border bg-black/35 p-4 text-base leading-7 text-foreground">
          <span style={{ color: accent }}>$ </span>
          {entry.command}
        </pre>
      ) : null}
      {entry.output ? (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-sm bg-background/80 p-4 text-sm leading-6 text-muted-foreground">
          {entry.output}
        </pre>
      ) : null}
    </div>
  )
}

function SystemLine({ entry }: { entry: LogEntry }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
      <span className="text-primary">{formatTime(entry.at)}</span>
      <span className={entry.level === "result" ? "text-primary" : "text-muted-foreground"}>
        {entry.message}
      </span>
    </div>
  )
}

function toLogEntry(
  at: string,
  message: string,
  level: LogEntry["level"],
  command?: string,
  output?: string
): LogEntry {
  return {
    id: `${at}-${message}`,
    at,
    message,
    level,
    command,
    output,
  }
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value))
}
