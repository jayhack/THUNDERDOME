"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, CircleDot, RadioTower, Shield, Skull, Swords, Trophy, Zap } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { type AgentDefinition, type TaskDefinition } from "@/lib/arena-data"
import { type ArenaStreamEvent } from "@/lib/match-events"

type ArenaClientProps = {
  matchId: string
  left: AgentDefinition
  right: AgentDefinition
  task: TaskDefinition
}

type LogEntry = {
  id: string
  at: string
  message: string
  level: "signal" | "tool" | "strike" | "guard" | "system" | "result"
}

type SideState = {
  integrity: number
  score: number
  logs: LogEntry[]
}

const initialSideState: SideState = {
  integrity: 100,
  score: 0,
  logs: [],
}

export function ArenaClient({ matchId, left, right, task }: ArenaClientProps) {
  const [connected, setConnected] = useState(false)
  const [phase, setPhase] = useState("boot")
  const [winner, setWinner] = useState<"left" | "right" | null>(null)
  const [systemLog, setSystemLog] = useState<LogEntry[]>([])
  const [leftState, setLeftState] = useState<SideState>(initialSideState)
  const [rightState, setRightState] = useState<SideState>(initialSideState)
  const terminalRef = useRef<HTMLDivElement | null>(null)

  const streamUrl = useMemo(() => {
    const params = new URLSearchParams({
      left: left.id,
      right: right.id,
      task: task.id,
    })

    return `/api/matches/${matchId}/stream?${params.toString()}`
  }, [left.id, matchId, right.id, task.id])

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
          integrity: event.integrity,
          score: event.score,
          logs: [...current.logs, toLogEntry(event.at, event.message, event.level)],
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
        setLeftState((current) => ({
          ...current,
          integrity: event.leftIntegrity,
          score: event.leftScore,
        }))
        setRightState((current) => ({
          ...current,
          integrity: event.rightIntegrity,
          score: event.rightScore,
        }))
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
    terminalRef.current?.scrollIntoView({ block: "end" })
  }, [leftState.logs.length, rightState.logs.length, systemLog.length])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="thunder-shell min-h-screen">
        <header className="border-b border-border/80 bg-background/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                aria-label="Back to match setup"
                className={buttonVariants({ variant: "outline", size: "icon" })}
              >
                <ArrowLeft />
              </Link>
              <div>
                <p className="font-mono text-xs uppercase text-muted-foreground">
                  Match {matchId.slice(0, 8)}
                </p>
                <h1 className="text-2xl font-semibold tracking-normal text-foreground">
                  {task.name}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-md border-cyan-300/40 bg-cyan-300/10 text-cyan-100">
                <RadioTower data-icon="inline-start" />
                {connected ? "streaming" : winner ? "complete" : "reconnecting"}
              </Badge>
              <Badge className="rounded-md border-amber-300/40 bg-amber-300/10 text-amber-100">
                <CircleDot data-icon="inline-start" />
                {phase}
              </Badge>
            </div>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_88px_minmax(0,1fr)] lg:px-8">
          <AgentPanel
            agent={left}
            side="left"
            state={leftState}
            winner={winner}
            opponent={right.name}
          />

          <div className="flex items-center justify-center lg:min-h-[650px]">
            <div className="flex h-20 w-full items-center justify-center border-y border-border bg-card/50 lg:h-full lg:w-16 lg:flex-col lg:border-x lg:border-y-0">
              <Swords className="size-7 text-primary" />
              <span className="mt-1 font-mono text-xs uppercase text-muted-foreground lg:mt-3 lg:[writing-mode:vertical-rl]">
                versus
              </span>
            </div>
          </div>

          <AgentPanel
            agent={right}
            side="right"
            state={rightState}
            winner={winner}
            opponent={left.name}
          />
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="rounded-md border border-border bg-card/85 p-4 shadow-[0_16px_60px_rgba(0,0,0,0.28)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-mono text-xs uppercase text-muted-foreground">
                  Sandbox Control
                </p>
                <h2 className="text-lg font-semibold text-foreground">{task.arena}</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {task.objective}
              </p>
            </div>
            <Separator className="my-4" />
            <div className="grid gap-2 font-mono text-sm text-muted-foreground">
              {systemLog.map((entry) => (
                <div key={entry.id} className="flex gap-3">
                  <span className="w-20 shrink-0 text-primary">{formatTime(entry.at)}</span>
                  <span className={entry.level === "result" ? "text-primary" : ""}>
                    {entry.message}
                  </span>
                </div>
              ))}
              <div ref={terminalRef} />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function AgentPanel({
  agent,
  state,
  side,
  winner,
  opponent,
}: {
  agent: AgentDefinition
  state: SideState
  side: "left" | "right"
  winner: "left" | "right" | null
  opponent: string
}) {
  const isWinner = winner === side
  const isEliminated = winner !== null && !isWinner

  return (
    <article
      className="min-h-[620px] rounded-md border bg-card/90 shadow-[0_18px_80px_rgba(0,0,0,0.35)]"
      style={{ borderColor: `${agent.accent}66` }}
    >
      <div
        className="h-2 rounded-t-md"
        style={{
          background: `linear-gradient(90deg, ${agent.accent}, ${agent.signal})`,
        }}
      />
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase text-muted-foreground">
              {side === "left" ? "Left Bay" : "Right Bay"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-foreground">
              {agent.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {agent.callsign} / {agent.provider}
            </p>
          </div>
          <Badge
            className="rounded-md"
            style={{
              backgroundColor: `${agent.accent}22`,
              borderColor: `${agent.accent}66`,
              color: agent.signal,
            }}
          >
            {winner ? (
              isWinner ? (
                <Trophy data-icon="inline-start" />
              ) : (
                <Skull data-icon="inline-start" />
              )
            ) : (
              <Zap data-icon="inline-start" />
            )}
            {winner ? (isWinner ? "winner" : "offline") : "armed"}
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="integrity" value={`${state.integrity}%`}>
            <Progress
              value={state.integrity}
              className="[&_[data-slot=progress-indicator]]:bg-primary"
            />
          </Metric>
          <Metric label="score" value={state.score.toString()}>
            <div className="flex h-1 items-center overflow-hidden rounded-full bg-muted">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min(100, state.score)}%`,
                  backgroundColor: agent.accent,
                }}
              />
            </div>
          </Metric>
        </div>

        <div className="rounded-md border border-border bg-background/70">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-mono text-xs uppercase text-muted-foreground">
              Public Action Stream
            </span>
            <span className="font-mono text-xs text-muted-foreground">target: {opponent}</span>
          </div>
          <ScrollArea className="h-[390px]">
            <div className="grid gap-3 p-3">
              {state.logs.length === 0 ? (
                <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                  awaiting first signal
                </div>
              ) : (
                state.logs.map((entry) => (
                  <LogLine key={entry.id} entry={entry} accent={agent.accent} />
                ))
              )}
              {isEliminated ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  runner terminated
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </div>
    </article>
  )
}

function Metric({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-border bg-background/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-xs uppercase text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-sm text-foreground">{value}</span>
      </div>
      {children}
    </div>
  )
}

function LogLine({ entry, accent }: { entry: LogEntry; accent: string }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 rounded-md border border-border bg-card/70 p-3 font-mono text-sm">
      <span className="text-muted-foreground">{formatTime(entry.at)}</span>
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <Shield className="size-3.5" style={{ color: accent }} />
          <span className="uppercase" style={{ color: accent }}>
            {entry.level}
          </span>
        </div>
        <p className="break-words leading-6 text-foreground">{entry.message}</p>
      </div>
    </div>
  )
}

function toLogEntry(at: string, message: string, level: LogEntry["level"]): LogEntry {
  return {
    id: `${at}-${message}`,
    at,
    message,
    level,
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
