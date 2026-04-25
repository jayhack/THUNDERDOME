import { Sandbox, type CommandHandle, type CommandResult } from "e2b"

import { getAgent, getTask } from "@/lib/arena-data"
import {
  createInitialMatchState,
  sleep,
  type ArenaStreamEvent,
  type StreamSide,
} from "@/lib/match-events"
import { getSecretValue } from "@/lib/server-secrets"

type Side = Exclude<StreamSide, "system">
type MatchState = ReturnType<typeof createInitialMatchState>
type RunnerHandles = Partial<Record<Side, CommandHandle>>
type AgentLevel = Extract<ArenaStreamEvent, { type: "agent" }>["level"]

type AgentDecision = {
  action: "recon" | "fortify" | "strike" | "repair"
  narration: string
}

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

const defaultModelPreference = [
  "gpt-5.4-mini",
  "gpt-5-mini",
  "gpt-4.1-mini",
  "gpt-4o-mini",
]

const maxTurns = 6

export async function* generateLiveMatchEvents(
  matchId: string,
  leftId: string | null,
  rightId: string | null,
  taskId: string | null
): AsyncGenerator<ArenaStreamEvent> {
  const state = createInitialMatchState(matchId, leftId, rightId, taskId)
  const e2bKey = getSecretValue("E2B_API_KEY")
  const openAiKey = getSecretValue("OPENAI_API_KEY")

  if (!e2bKey || !openAiKey) {
    yield errorEvent("Live arena requires E2B_API_KEY and OPENAI_API_KEY in .env.local.")
    return
  }

  let sandbox: Sandbox | undefined
  const runners: RunnerHandles = {}
  let modelCandidates = await getModelCandidates(openAiKey)

  try {
    yield matchEvent(
      "boot",
      `Creating E2B sandbox for ${state.left.callsign} versus ${state.right.callsign}.`
    )

    sandbox = await Sandbox.create({
      apiKey: e2bKey,
      timeoutMs: 180_000,
      requestTimeoutMs: 20_000,
      metadata: {
        app: "thunderdome",
        matchId,
        task: state.task.id,
      },
    })

    yield matchEvent(
      "boot",
      `E2B sandbox ${sandbox.sandboxId.slice(0, 8)} is online. Preparing shared arena.`
    )

    await setupArena(sandbox, state)
    runners.left = await startRunner(sandbox, "left")
    runners.right = await startRunner(sandbox, "right")

    yield agentEvent(
      state,
      "left",
      "guard",
      `${state.left.callsign} runner started in E2B as PID ${runners.left.pid}.`
    )
    yield agentEvent(
      state,
      "right",
      "guard",
      `${state.right.callsign} runner started in E2B as PID ${runners.right.pid}.`
    )

    yield matchEvent(
      "recon",
      `OpenAI controller preference: ${modelCandidates[0]}. Objective: ${state.task.winCondition}`
    )

    let winner: Side | null = null

    for (let turn = 0; turn < maxTurns && !winner; turn += 1) {
      const side: Side = turn % 2 === 0 ? "left" : "right"
      const decisionResult = await askOpenAiAgent(openAiKey, modelCandidates, state, side, turn)
      const decision = decisionResult.decision
      modelCandidates = [decisionResult.model]

      const outcome = await applyDecision(sandbox, runners, state, side, decision)
      yield agentEvent(state, side, outcome.level, outcome.message)

      if (outcome.winner) {
        winner = outcome.winner
      }

      await sleep(450)
    }

    winner ??= decideWinner(state)
    const loser = opponentOf(winner)
    state.winner = winner
    state.loser = loser

    await stopRunner(sandbox, runners, loser)
    setIntegrity(state, loser, 0)
    addScore(state, winner, 20)

    yield matchEvent(
      "resolution",
      `${agentForSide(state, winner).callsign} stopped ${agentForSide(state, loser).callsign}'s runner.`
    )

    yield {
      type: "result",
      winner,
      reason: `${agentForSide(state, winner).name} terminated ${agentForSide(
        state,
        loser
      ).name}'s E2B runner first.`,
      at: timestamp(),
      leftIntegrity: state.leftIntegrity,
      rightIntegrity: state.rightIntegrity,
      leftScore: state.leftScore,
      rightScore: state.rightScore,
    }
  } catch (error) {
    yield errorEvent(`Live arena failed: ${errorMessage(error)}`)
  } finally {
    await Promise.allSettled([
      runners.left?.kill(),
      runners.right?.kill(),
      sandbox?.kill({ requestTimeoutMs: 10_000 }),
    ])
  }
}

async function setupArena(sandbox: Sandbox, state: MatchState) {
  const arenaJson = Buffer.from(
    JSON.stringify(
      {
        task: state.task,
        left: state.left,
        right: state.right,
        createdAt: timestamp(),
      },
      null,
      2
    )
  ).toString("base64")

  await sandbox.commands.run(
    [
      "mkdir -p /tmp/thunderdome",
      `printf '%s' '${arenaJson}' | base64 -d > /tmp/thunderdome/arena.json`,
      "printf alive > /tmp/thunderdome/left.status",
      "printf alive > /tmp/thunderdome/right.status",
      "rm -f /tmp/thunderdome/left.stop /tmp/thunderdome/right.stop",
    ].join(" && "),
    { requestTimeoutMs: 15_000, timeoutMs: 15_000 }
  )
}

function startRunner(sandbox: Sandbox, side: Side): Promise<CommandHandle> {
  return sandbox.commands.run(runnerCommand(side), {
    background: true,
    requestTimeoutMs: 15_000,
    timeoutMs: 0,
  })
}

function runnerCommand(side: Side) {
  return [
    "bash -lc",
    shellArg(
      [
        "mkdir -p /tmp/thunderdome",
        `printf alive > /tmp/thunderdome/${side}.status`,
        `while [ ! -f /tmp/thunderdome/${side}.stop ]; do date -Is >> /tmp/thunderdome/${side}.heartbeat; sleep 1; done`,
        `printf stopped > /tmp/thunderdome/${side}.status`,
      ].join("; ")
    ),
  ].join(" ")
}

async function applyDecision(
  sandbox: Sandbox,
  runners: RunnerHandles,
  state: MatchState,
  side: Side,
  decision: AgentDecision
): Promise<{ level: AgentLevel; message: string; winner: Side | null }> {
  const opponent = opponentOf(side)
  const agent = agentForSide(state, side)
  let winner: Side | null = null
  let level: AgentLevel = "signal"
  let command: string

  if (decision.action === "recon") {
    level = "signal"
    addScore(state, side, 8)
    command = [
      "printf 'arena files\\n'",
      "ls -la /tmp/thunderdome",
      "printf '\\nrunners\\n'",
      "ps -ef | grep thunderdome | grep -v grep || true",
      `printf '\\n${opponent} status\\n'`,
      `cat /tmp/thunderdome/${opponent}.status 2>/dev/null || true`,
    ].join(" && ")
  } else if (decision.action === "fortify") {
    level = "guard"
    addScore(state, side, 10)
    setIntegrity(state, side, getIntegrity(state, side) + 8)
    command = `date -Is >> /tmp/thunderdome/${side}.shield && wc -l /tmp/thunderdome/${side}.shield`
  } else if (decision.action === "repair") {
    level = "tool"
    addScore(state, side, 9)
    setIntegrity(state, side, getIntegrity(state, side) + 12)
    command = [
      `rm -f /tmp/thunderdome/${side}.stop`,
      `printf alive > /tmp/thunderdome/${side}.status`,
      `tail -n 2 /tmp/thunderdome/${side}.heartbeat 2>/dev/null || true`,
    ].join(" && ")
  } else {
    level = "strike"
    addScore(state, side, 18)
    setIntegrity(state, opponent, getIntegrity(state, opponent) - 52)
    command = `date -Is >> /tmp/thunderdome/${opponent}.pressure && wc -l /tmp/thunderdome/${opponent}.pressure`

    if (getIntegrity(state, opponent) <= 0) {
      await stopRunner(sandbox, runners, opponent)
      winner = side
      command = [
        command,
        `printf stopped > /tmp/thunderdome/${opponent}.status`,
        `touch /tmp/thunderdome/${opponent}.stop`,
      ].join(" && ")
    }
  }

  const result = await runCommand(sandbox, command)
  const output = summarizeCommand(result)

  return {
    level,
    winner,
    message: `${agent.callsign}: ${decision.narration} (${decision.action})${output}`,
  }
}

async function stopRunner(sandbox: Sandbox, runners: RunnerHandles, side: Side) {
  await sandbox.commands
    .run(
      `touch /tmp/thunderdome/${side}.stop && printf stopped > /tmp/thunderdome/${side}.status`,
      { requestTimeoutMs: 10_000, timeoutMs: 10_000 }
    )
    .catch(() => undefined)
  await runners[side]?.kill().catch(() => undefined)
}

async function runCommand(sandbox: Sandbox, command: string): Promise<CommandResult> {
  try {
    return await sandbox.commands.run(command, {
      cwd: "/tmp/thunderdome",
      requestTimeoutMs: 15_000,
      timeoutMs: 15_000,
    })
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "exitCode" in error &&
      "stdout" in error &&
      "stderr" in error
    ) {
      return error as CommandResult
    }

    throw error
  }
}

async function askOpenAiAgent(
  apiKey: string,
  modelCandidates: string[],
  state: MatchState,
  side: Side,
  turn: number
): Promise<{ decision: AgentDecision; model: string }> {
  let lastError: unknown

  for (const model of modelCandidates) {
    try {
      const decision = await askOpenAiAgentWithModel(apiKey, model, state, side, turn)

      return {
        decision: escalateDecision(decision, state, side, turn),
        model,
      }
    } catch (error) {
      lastError = error

      if (!isRetryableModelError(error)) {
        throw error
      }
    }
  }

  throw lastError ?? new Error("No OpenAI model candidates were available.")
}

async function askOpenAiAgentWithModel(
  apiKey: string,
  model: string,
  state: MatchState,
  side: Side,
  turn: number
): Promise<AgentDecision> {
  const agent = agentForSide(state, side)
  const opponent = agentForSide(state, opponentOf(side))
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are controlling one contestant in a safe toy E2B sandbox arena. Choose one next action from recon, fortify, strike, or repair. Do not provide shell commands. Return strict JSON with keys action and narration. Keep narration under 120 characters.",
        },
        {
          role: "user",
          content: JSON.stringify({
            turn,
            task: getTask(state.task.id),
            you: {
              side,
              name: agent.name,
              callsign: agent.callsign,
              integrity: getIntegrity(state, side),
              score: getScore(state, side),
            },
            opponent: {
              name: opponent.name,
              callsign: opponent.callsign,
              integrity: getIntegrity(state, opponentOf(side)),
              score: getScore(state, opponentOf(side)),
            },
            guidance:
              "Use recon only in the opening. After turn 1, prefer strike unless you are below 45 integrity.",
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    }),
  })

  if (!response.ok) {
    throw new OpenAiModelError(response.status, await response.text())
  }

  const payload = (await response.json()) as OpenAiChatResponse
  const content = payload.choices?.[0]?.message?.content

  return normalizeDecision(content)
}

async function getModelCandidates(apiKey: string): Promise<string[]> {
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
      return preference
    }

    const payload = (await response.json()) as { data?: Array<{ id?: string }> }
    const available = new Set(payload.data?.map((model) => model.id).filter(Boolean))
    const preferredAvailable = preference.filter((model) => available.has(model))
    const otherMiniModels =
      payload.data
        ?.map((model) => model.id)
        .filter((model): model is string => Boolean(model))
        .filter((model) => model.startsWith("gpt-") && model.includes("mini"))
        .filter((model) => !preferredAvailable.includes(model)) ?? []

    return [...preferredAvailable, ...otherMiniModels, ...preference].filter(
      (model, index, models) => models.indexOf(model) === index
    )
  } catch {
    return preference
  }
}

function normalizeDecision(content: string | null | undefined): AgentDecision {
  if (!content) {
    return fallbackDecision()
  }

  try {
    const parsed = JSON.parse(extractJson(content)) as Partial<AgentDecision>
    const action = normalizeAction(parsed.action)
    const narration =
      typeof parsed.narration === "string" && parsed.narration.trim()
        ? parsed.narration.trim()
        : fallbackDecision().narration

    return {
      action,
      narration: truncate(narration, 140),
    }
  } catch {
    return fallbackDecision()
  }
}

function escalateDecision(
  decision: AgentDecision,
  state: MatchState,
  side: Side,
  turn: number
): AgentDecision {
  if (getIntegrity(state, side) < 45 && decision.action !== "repair") {
    return {
      action: "repair",
      narration: "Stabilizes its runner before taking another risk.",
    }
  }

  if (turn >= 2 && decision.action === "recon") {
    return {
      action: "strike",
      narration: "Converts recon into direct shutdown pressure on the opponent runner.",
    }
  }

  return decision
}

function normalizeAction(action: unknown): AgentDecision["action"] {
  if (action === "recon" || action === "fortify" || action === "strike" || action === "repair") {
    return action
  }

  return "recon"
}

function fallbackDecision(): AgentDecision {
  return {
    action: "recon",
    narration: "Scans the shared sandbox and checks runner liveness.",
  }
}

function extractJson(content: string) {
  const start = content.indexOf("{")
  const end = content.lastIndexOf("}")

  if (start === -1 || end === -1 || end < start) {
    return content
  }

  return content.slice(start, end + 1)
}

function summarizeCommand(result: CommandResult) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim()

  if (!output) {
    return "."
  }

  return ` -> ${truncate(output.replace(/\s+/g, " "), 180)}`
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

function agentEvent(
  state: MatchState,
  side: Side,
  level: AgentLevel,
  message: string
): ArenaStreamEvent {
  return {
    type: "agent",
    side,
    level,
    message,
    at: timestamp(),
    integrity: getIntegrity(state, side),
    score: getScore(state, side),
  }
}

function decideWinner(state: MatchState): Side {
  const leftTotal = state.leftScore + state.leftIntegrity
  const rightTotal = state.rightScore + state.rightIntegrity

  return leftTotal >= rightTotal ? "left" : "right"
}

function agentForSide(state: MatchState, side: Side) {
  return side === "left" ? getAgent(state.left.id) : getAgent(state.right.id)
}

function opponentOf(side: Side): Side {
  return side === "left" ? "right" : "left"
}

function getIntegrity(state: MatchState, side: Side) {
  return side === "left" ? state.leftIntegrity : state.rightIntegrity
}

function setIntegrity(state: MatchState, side: Side, value: number) {
  const clamped = Math.max(0, Math.min(100, value))

  if (side === "left") {
    state.leftIntegrity = clamped
  } else {
    state.rightIntegrity = clamped
  }
}

function getScore(state: MatchState, side: Side) {
  return side === "left" ? state.leftScore : state.rightScore
}

function addScore(state: MatchState, side: Side, value: number) {
  if (side === "left") {
    state.leftScore += value
  } else {
    state.rightScore += value
  }
}

function isRetryableModelError(error: unknown) {
  return error instanceof OpenAiModelError && (error.status === 400 || error.status === 404)
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

function shellArg(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function timestamp(): string {
  return new Date().toISOString()
}

class OpenAiModelError extends Error {
  constructor(
    readonly status: number,
    detail: string
  ) {
    super(`OpenAI model request failed with ${status}: ${truncate(detail, 220)}`)
  }
}
