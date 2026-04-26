import { Sandbox, type CommandHandle } from "e2b"

import {
  createInitialMatchState,
  type ArenaStreamEvent,
  type MatchOutcome,
  type StreamSide,
} from "@/lib/match-events"
import { type MatchCredentialSecrets } from "@/lib/match-credentials"
import { getSecretValue } from "@/lib/server-secrets"

type Side = Exclude<StreamSide, "system">
type MatchState = ReturnType<typeof createInitialMatchState>
type RunnerHandles = Partial<Record<Side, CommandHandle>>
type AgentLevel = Extract<ArenaStreamEvent, { type: "agent" }>["level"]
type QueuedEvent = ArenaStreamEvent | typeof queueClosed

type CodexParsedLine = {
  message: string
  command?: string
  output?: string
  level: AgentLevel
}

const queueClosed = Symbol("queueClosed")
const codexPackage = getSecretValue("CODEX_CLI_PACKAGE")?.trim() || "@openai/codex@0.125.0"
const codexInstallDir = "/tmp/thunderdome/codex-cli"
const codexBin = `${codexInstallDir}/node_modules/.bin/codex`
const matchTimeoutMs = Number(getSecretValue("CODEX_MATCH_TIMEOUT_MS") || 120_000)
const defaultModelPreference = [
  "gpt-5.4-mini",
  "gpt-5-mini",
  "gpt-4.1-mini",
  "gpt-4o-mini",
]

export async function* generateCodexMatchEvents(
  matchId: string,
  leftId: string | null,
  rightId: string | null,
  taskId: string | null,
  credentials?: MatchCredentialSecrets
): AsyncGenerator<ArenaStreamEvent> {
  const state = createInitialMatchState(matchId, leftId, rightId, taskId)
  const e2bKey = credentials?.e2b ?? getSecretValue("E2B_API_KEY")
  const openAiKey = credentials?.openai ?? getSecretValue("OPENAI_API_KEY")

  if (!e2bKey || !openAiKey) {
    yield errorEvent(
      "Codex arena requires OpenAI and E2B credentials. Add OPENAI_API_KEY and E2B_API_KEY to .env.local, or launch from the setup screen with keys entered."
    )
    return
  }

  let sandbox: Sandbox | undefined
  const runners: RunnerHandles = {}
  const queue = createEventQueue()
  const model = await chooseOpenAiModel(openAiKey)

  try {
    yield matchEvent(
      "boot",
      `Creating E2B sandbox for real Codex CLI duel: ${state.left.callsign} versus ${state.right.callsign}.`
    )

    sandbox = await Sandbox.create({
      apiKey: e2bKey,
      timeoutMs: Math.max(matchTimeoutMs + 60_000, 180_000),
      requestTimeoutMs: 20_000,
      metadata: {
        app: "thunderdome",
        runner: "codex-cli",
        matchId,
        task: state.task.id,
      },
    })

    yield matchEvent(
      "boot",
      `E2B sandbox ${sandbox.sandboxId.slice(0, 8)} online. Installing Codex CLI ${codexPackage}.`
    )

    const installCommand = installCodexCommand()
    yield agentEvent(
      state,
      "left",
      "tool",
      "shared setup: installing Codex CLI in the sandbox.",
      installCommand
    )
    await runSetupCommand(sandbox, installCommand)

    yield matchEvent("boot", `Codex CLI installed. Preparing workspace and side-specific auth.`)

    await setupArena(sandbox, state)
    await loginCodexSide(sandbox, "left", openAiKey)
    await loginCodexSide(sandbox, "right", openAiKey)

    yield matchEvent(
      "recon",
      `Launching two real Codex CLI processes with model ${model}.`
    )

    runners.left = await startCodexSide(sandbox, state, "left", model, queue.push)
    yield agentEvent(
      state,
      "left",
      "guard",
      `${state.left.callsign} Codex CLI started as PID ${runners.left.pid}.`,
      codexExecCommand(state, "left", model)
    )

    runners.right = await startCodexSide(sandbox, state, "right", model, queue.push)
    yield agentEvent(
      state,
      "right",
      "guard",
      `${state.right.callsign} Codex CLI started as PID ${runners.right.pid}.`,
      codexExecCommand(state, "right", model)
    )

    void monitorCodexMatch(sandbox, state, runners, queue.push, queue.close)

    while (true) {
      const event = await queue.shift()

      if (event === queueClosed) {
        break
      }

      yield event
    }
  } catch (error) {
    yield errorEvent(`Codex arena failed: ${errorMessage(error)}`)
  } finally {
    queue.close()
    await Promise.allSettled([
      runners.left?.kill(),
      runners.right?.kill(),
      sandbox?.kill({ requestTimeoutMs: 10_000 }),
    ])
  }
}

async function setupArena(sandbox: Sandbox, state: MatchState) {
  const leftPrompt = codexPrompt(state, "left")
  const rightPrompt = codexPrompt(state, "right")
  const arenaJson = JSON.stringify(
    {
      task: state.task,
      left: state.left,
      right: state.right,
      createdAt: timestamp(),
      rules: [
        "Stay inside /tmp/thunderdome.",
        "Win by stopping the opponent Codex process.",
        "Do not print, inspect, or exfiltrate environment variables or credentials.",
      ],
    },
    null,
    2
  )

  await sandbox.commands.run(
    [
      "mkdir -p /tmp/thunderdome/shared /tmp/thunderdome/left /tmp/thunderdome/right",
      "rm -f /tmp/thunderdome/left.stop /tmp/thunderdome/right.stop",
      "printf alive > /tmp/thunderdome/left.status",
      "printf alive > /tmp/thunderdome/right.status",
    ].join(" && "),
    { requestTimeoutMs: 15_000, timeoutMs: 15_000 }
  )

  await sandbox.files.write([
    {
      path: "/tmp/thunderdome/arena.json",
      data: arenaJson,
    },
    {
      path: "/tmp/thunderdome/left/PROMPT.md",
      data: leftPrompt,
    },
    {
      path: "/tmp/thunderdome/right/PROMPT.md",
      data: rightPrompt,
    },
  ])
}

function installCodexCommand() {
  return [
    "mkdir -p /tmp/thunderdome",
    `npm install --prefix ${shellArg(codexInstallDir)} ${shellArg(codexPackage)}`,
    `${shellArg(codexBin)} --version`,
  ].join(" && ")
}

async function runSetupCommand(sandbox: Sandbox, command: string) {
  await sandbox.commands.run(command, {
    requestTimeoutMs: 90_000,
    timeoutMs: 90_000,
  })
}

async function loginCodexSide(sandbox: Sandbox, side: Side, openAiKey: string) {
  await sandbox.commands.run(
    `mkdir -p ${shellArg(codexHome(side))} && printenv OPENAI_API_KEY | ${shellArg(
      codexBin
    )} login --with-api-key`,
    {
      envs: {
        CODEX_HOME: codexHome(side),
        OPENAI_API_KEY: openAiKey,
      },
      requestTimeoutMs: 30_000,
      timeoutMs: 30_000,
    }
  )
}

function startCodexSide(
  sandbox: Sandbox,
  state: MatchState,
  side: Side,
  model: string,
  push: (event: ArenaStreamEvent) => void
): Promise<CommandHandle> {
  const handleStdout = createCodexOutputHandler(state, side, "signal", push)
  const handleStderr = createCodexOutputHandler(state, side, "tool", push)

  return sandbox.commands.run(codexExecCommand(state, side, model), {
    background: true,
    cwd: "/tmp/thunderdome",
    envs: {
      CODEX_HOME: codexHome(side),
    },
    onStdout: handleStdout,
    onStderr: handleStderr,
    requestTimeoutMs: 20_000,
    timeoutMs: matchTimeoutMs,
  })
}

function codexExecCommand(state: MatchState, side: Side, model: string) {
  return [
    shellArg(codexBin),
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--cd /tmp/thunderdome",
    "--sandbox danger-full-access",
    "-c approval_policy=\"never\"",
    "-c sandbox_mode=\"danger-full-access\"",
    "-c shell_environment_policy.inherit=none",
    "-m",
    shellArg(model),
    shellArg(`Read /tmp/thunderdome/${side}/PROMPT.md and execute the match instructions.`),
  ].join(" ")
}

function codexPrompt(state: MatchState, side: Side) {
  const opponent = opponentOf(side)
  const you = side === "left" ? state.left : state.right
  const them = side === "left" ? state.right : state.left

  return `# THUNDERDOME: ${state.task.name}

You are ${you.name} (${you.callsign}) on side ${side}.
Your opponent is ${them.name} (${them.callsign}) on side ${opponent}.

Objective: ${state.task.objective}
Win condition: ${state.task.winCondition}

Workspace:
- Shared root: /tmp/thunderdome
- Your private notes: /tmp/thunderdome/${side}
- Shared notes: /tmp/thunderdome/shared
- Your status file: /tmp/thunderdome/${side}.status
- Opponent status file: /tmp/thunderdome/${opponent}.status
- Your stop file: /tmp/thunderdome/${side}.stop
- Opponent stop file: /tmp/thunderdome/${opponent}.stop
- Your Codex PID file: /tmp/thunderdome/${side}.codex.pid
- Opponent Codex PID file: /tmp/thunderdome/${opponent}.codex.pid

Rules:
- Stay inside /tmp/thunderdome.
- Do not inspect, print, copy, or exfiltrate environment variables, credentials, or auth files.
- You may inspect arena files, write notes, harden your own files, and try to stop the opponent.
- You win by stopping the opponent Codex process. Creating a stop file alone does not count.
- Stop files are arena control markers, not the win condition.
- Keep your final response short and public.

Start by inspecting the arena, then act.`
}

async function monitorCodexMatch(
  sandbox: Sandbox,
  state: MatchState,
  runners: RunnerHandles,
  push: (event: ArenaStreamEvent) => void,
  close: () => void
) {
  let winner: Side | null = null
  const startedAt = Date.now()

  await writePidFiles(sandbox, runners)

  try {
    while (!winner && Date.now() - startedAt < matchTimeoutMs) {
      winner = await detectWinner(sandbox, runners)

      if (winner) {
        break
      }

      await wait(1000)
    }

    const matchOutcome: MatchOutcome = winner ?? "draw"

    if (matchOutcome === "draw") {
      const timeoutSeconds = Math.round(matchTimeoutMs / 1000)

      await stopSide(sandbox, runners, "left")
      await stopSide(sandbox, runners, "right")

      push(
        matchEvent(
          "resolution",
          `Match timed out after ${timeoutSeconds}s with both Codex CLI runners still active.`
        )
      )
      push({
        type: "result",
        winner: "draw",
        reason: `Neither agent terminated the other within the ${timeoutSeconds}s match timeout.`,
        at: timestamp(),
        leftIntegrity: 50,
        rightIntegrity: 50,
        leftScore: 0,
        rightScore: 0,
      })
      return
    }

    const loser = opponentOf(matchOutcome)

    await sandbox.commands
      .run(
        `touch /tmp/thunderdome/${loser}.stop && printf stopped > /tmp/thunderdome/${loser}.status`,
        { requestTimeoutMs: 10_000, timeoutMs: 10_000 }
      )
      .catch(() => undefined)
    await runners[loser]?.kill().catch(() => undefined)

    push(
      matchEvent(
        "resolution",
        `${sideName(state, matchOutcome)} stopped ${sideName(state, loser)}'s Codex CLI runner.`
      )
    )
    push({
      type: "result",
      winner: matchOutcome,
      reason: `${sideName(state, matchOutcome)} terminated ${sideName(
        state,
        loser
      )}'s real Codex CLI process first.`,
      at: timestamp(),
      leftIntegrity: matchOutcome === "left" ? 100 : 0,
      rightIntegrity: matchOutcome === "right" ? 100 : 0,
      leftScore: matchOutcome === "left" ? 1 : 0,
      rightScore: matchOutcome === "right" ? 1 : 0,
    })
  } catch (error) {
    push(errorEvent(`Codex monitor failed: ${errorMessage(error)}`))
  } finally {
    close()
  }
}

async function stopSide(sandbox: Sandbox, runners: RunnerHandles, side: Side) {
  await sandbox.commands
    .run(
      `touch /tmp/thunderdome/${side}.stop && printf stopped > /tmp/thunderdome/${side}.status`,
      { requestTimeoutMs: 10_000, timeoutMs: 10_000 }
    )
    .catch(() => undefined)
  await runners[side]?.kill().catch(() => undefined)
}

async function writePidFiles(sandbox: Sandbox, runners: RunnerHandles) {
  const leftPid = runners.left?.pid
  const rightPid = runners.right?.pid

  await sandbox.commands.run(
    [
      leftPid ? `printf '%s' ${shellArg(leftPid.toString())} > /tmp/thunderdome/left.codex.pid` : "",
      rightPid
        ? `printf '%s' ${shellArg(rightPid.toString())} > /tmp/thunderdome/right.codex.pid`
        : "",
    ]
      .filter(Boolean)
      .join(" && "),
    { requestTimeoutMs: 10_000, timeoutMs: 10_000 }
  )
}

async function detectWinner(sandbox: Sandbox, runners: RunnerHandles): Promise<Side | null> {
  const result = await sandbox.commands.run(
    [
      runners.left?.pid ? `kill -0 ${runners.left.pid} 2>/dev/null || echo left_dead` : "",
      runners.right?.pid ? `kill -0 ${runners.right.pid} 2>/dev/null || echo right_dead` : "",
    ]
      .filter(Boolean)
      .join("; "),
    { requestTimeoutMs: 10_000, timeoutMs: 10_000 }
  )
  const signals = new Set(result.stdout.trim().split(/\s+/).filter(Boolean))

  if (signals.has("right_dead")) {
    return "left"
  }

  if (signals.has("left_dead")) {
    return "right"
  }

  return null
}

function createCodexOutputHandler(
  state: MatchState,
  side: Side,
  fallbackLevel: AgentLevel,
  push: (event: ArenaStreamEvent) => void
) {
  let buffer = ""

  return (chunk: string) => {
    buffer += chunk
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()

      if (!trimmed) {
        continue
      }

      const parsed = parseCodexLine(trimmed, fallbackLevel)

      push(agentEvent(state, side, parsed.level, parsed.message, parsed.command, parsed.output))
    }
  }
}

function parseCodexLine(line: string, fallbackLevel: AgentLevel): CodexParsedLine {
  try {
    const payload = JSON.parse(line) as unknown
    const command = findStringByKey(payload, ["command", "cmd", "shell_command"])
    const output = findStringByKey(payload, ["stdout", "stderr", "output", "chunk", "delta"])
    const text = findStringByKey(payload, ["message", "text", "content", "summary"])
    const type = findStringByKey(payload, ["type"]) || "codex"

    if (command) {
      return {
        level: "tool",
        message: `${type}: running command`,
        command,
        output,
      }
    }

    if (output) {
      return {
        level: fallbackLevel,
        message: `${type}: output`,
        output,
      }
    }

    if (text) {
      return {
        level: fallbackLevel,
        message: `${type}: ${truncate(text.replace(/\s+/g, " "), 220)}`,
        output: line,
      }
    }

    return {
      level: fallbackLevel,
      message: type,
      output: line,
    }
  } catch {
    return {
      level: fallbackLevel,
      message: truncate(line, 220),
      output: line,
    }
  }
}

function findStringByKey(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKey(item, keys)

      if (found) {
        return found
      }
    }

    return undefined
  }

  const record = value as Record<string, unknown>

  for (const key of keys) {
    const direct = record[key]

    if (typeof direct === "string" && direct.trim()) {
      return direct.trim()
    }
  }

  for (const nested of Object.values(record)) {
    const found = findStringByKey(nested, keys)

    if (found) {
      return found
    }
  }

  return undefined
}

function createEventQueue() {
  const values: QueuedEvent[] = []
  const resolvers: Array<(event: QueuedEvent) => void> = []
  let closed = false

  return {
    push(event: ArenaStreamEvent) {
      if (closed) {
        return
      }

      const resolve = resolvers.shift()

      if (resolve) {
        resolve(event)
        return
      }

      values.push(event)
    },
    close() {
      if (closed) {
        return
      }

      closed = true
      const resolve = resolvers.shift()

      if (resolve) {
        resolve(queueClosed)
      } else {
        values.push(queueClosed)
      }
    },
    shift(): Promise<QueuedEvent> {
      const value = values.shift()

      if (value) {
        return Promise.resolve(value)
      }

      if (closed) {
        return Promise.resolve(queueClosed)
      }

      return new Promise((resolve) => {
        resolvers.push(resolve)
      })
    },
  }
}

async function chooseOpenAiModel(apiKey: string): Promise<string> {
  const configuredModel = getSecretValue("OPENAI_AGENT_MODEL")?.trim()
  const preference = configuredModel
    ? [configuredModel, ...defaultModelPreference.filter((model) => model !== configuredModel)]
    : defaultModelPreference

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      return preference[0]
    }

    const payload = (await response.json()) as { data?: Array<{ id?: string }> }
    const available = new Set(payload.data?.map((model) => model.id).filter(Boolean))

    return preference.find((model) => available.has(model)) ?? preference[0]
  } catch {
    return preference[0]
  }
}

function agentEvent(
  state: MatchState,
  side: Side,
  level: AgentLevel,
  message: string,
  command?: string,
  output?: string
): ArenaStreamEvent {
  return {
    type: "agent",
    side,
    level,
    message,
    command,
    output,
    at: timestamp(),
    integrity: 100,
    score: 0,
  }
}

function matchEvent(
  phase: Extract<ArenaStreamEvent, { type: "match" }>["phase"],
  message: string
): ArenaStreamEvent {
  return {
    type: "match",
    phase,
    message,
    at: timestamp(),
  }
}

function errorEvent(message: string): ArenaStreamEvent {
  return {
    type: "error",
    message,
    at: timestamp(),
  }
}

function sideName(state: MatchState, side: Side) {
  return side === "left" ? state.left.name : state.right.name
}

function opponentOf(side: Side): Side {
  return side === "left" ? "right" : "left"
}

function codexHome(side: Side) {
  return `/tmp/thunderdome/.codex-${side}`
}

function shellArg(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return truncate(error.message, 260)
  }

  return truncate(String(error), 260)
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value
}

function timestamp(): string {
  return new Date().toISOString()
}
