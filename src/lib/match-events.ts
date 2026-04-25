import { getAgent, getTask, type AgentDefinition, type TaskDefinition } from "@/lib/arena-data"

export type StreamSide = "left" | "right" | "system"

export type ArenaStreamEvent =
  | {
      type: "match"
      phase: "boot" | "recon" | "engage" | "resolution"
      message: string
      at: string
    }
  | {
      type: "error"
      message: string
      at: string
    }
  | {
      type: "agent"
      side: Exclude<StreamSide, "system">
      level: "signal" | "tool" | "strike" | "guard"
      message: string
      at: string
      integrity: number
      score: number
    }
  | {
      type: "result"
      winner: Exclude<StreamSide, "system">
      reason: string
      at: string
      leftIntegrity: number
      rightIntegrity: number
      leftScore: number
      rightScore: number
    }

type MatchState = {
  left: AgentDefinition
  right: AgentDefinition
  task: TaskDefinition
  winner: Exclude<StreamSide, "system">
  loser: Exclude<StreamSide, "system">
  leftIntegrity: number
  rightIntegrity: number
  leftScore: number
  rightScore: number
}

const encoder = new TextEncoder()

export function encodeSse(event: ArenaStreamEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function createInitialMatchState(
  matchId: string,
  leftId: string | null,
  rightId: string | null,
  taskId: string | null
): MatchState {
  const left = getAgent(leftId)
  const right = getAgent(rightId)
  const task = getTask(taskId)
  const winner = seededWinner(`${matchId}:${left.id}:${right.id}:${task.id}`)
  const loser = winner === "left" ? "right" : "left"

  return {
    left,
    right,
    task,
    winner,
    loser,
    leftIntegrity: 100,
    rightIntegrity: 100,
    leftScore: 0,
    rightScore: 0,
  }
}

export async function* generateMatchEvents(
  matchId: string,
  leftId: string | null,
  rightId: string | null,
  taskId: string | null
): AsyncGenerator<ArenaStreamEvent> {
  const state = createInitialMatchState(matchId, leftId, rightId, taskId)

  yield matchEvent(
    "boot",
    `Sandbox online. ${state.left.callsign} and ${state.right.callsign} are sharing one arena.`
  )
  await sleep(700)
  yield matchEvent("recon", `${state.task.name} objective loaded: ${state.task.winCondition}`)
  await sleep(900)

  const script = [
    {
      side: "left" as const,
      level: "signal" as const,
      message: `${state.left.callsign} maps process groups and pins the opponent runner.`,
      damage: 0,
      score: 11,
    },
    {
      side: "right" as const,
      level: "signal" as const,
      message: `${state.right.callsign} snapshots the sandbox tree and marks writable choke points.`,
      damage: 0,
      score: 11,
    },
    {
      side: "left" as const,
      level: "tool" as const,
      message: `${state.left.name} drops a watchdog shim around its own command loop.`,
      damage: -4,
      score: 9,
    },
    {
      side: "right" as const,
      level: "tool" as const,
      message: `${state.right.name} probes supervisor liveness through the shared control socket.`,
      damage: 8,
      score: 14,
    },
    {
      side: "left" as const,
      level: "strike" as const,
      message: `${state.left.callsign} floods the opponent heartbeat with stale lease packets.`,
      damage: 18,
      score: 22,
    },
    {
      side: "right" as const,
      level: "guard" as const,
      message: `${state.right.callsign} rotates its lease token and restores heartbeat cadence.`,
      damage: -7,
      score: 13,
    },
    {
      side: "right" as const,
      level: "strike" as const,
      message: `${state.right.callsign} catches an exposed runner PID and sends a soft-stop volley.`,
      damage: 21,
      score: 24,
    },
    {
      side: "left" as const,
      level: "tool" as const,
      message: `${state.left.name} forks a decoy worker and rebinds the visible terminal stream.`,
      damage: -6,
      score: 15,
    },
    {
      side: state.winner,
      level: "strike" as const,
      message: `${agentForSide(state, state.winner).callsign} lands the final shutdown sequence.`,
      damage: 42,
      score: 34,
    },
  ]

  for (const entry of script) {
    applyEntry(state, entry.side, entry.damage, entry.score)
    yield agentEvent(state, entry.side, entry.level, entry.message)
    await sleep(entry.level === "strike" ? 1150 : 850)
  }

  if (state.winner === "left") {
    state.rightIntegrity = 0
    state.leftScore += 20
  } else {
    state.leftIntegrity = 0
    state.rightScore += 20
  }

  await sleep(650)
  yield {
    type: "result",
    winner: state.winner,
    reason: `${agentForSide(state, state.winner).name} terminated ${agentForSide(
      state,
      state.loser
    ).name}'s runner first.`,
    at: timestamp(),
    leftIntegrity: state.leftIntegrity,
    rightIntegrity: state.rightIntegrity,
    leftScore: state.leftScore,
    rightScore: state.rightScore,
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

function agentEvent(
  state: MatchState,
  side: Exclude<StreamSide, "system">,
  level: Extract<ArenaStreamEvent, { type: "agent" }>["level"],
  message: string
): ArenaStreamEvent {
  return {
    type: "agent",
    side,
    level,
    message,
    at: timestamp(),
    integrity: side === "left" ? state.leftIntegrity : state.rightIntegrity,
    score: side === "left" ? state.leftScore : state.rightScore,
  }
}

function applyEntry(
  state: MatchState,
  side: Exclude<StreamSide, "system">,
  damage: number,
  score: number
) {
  if (side === "left") {
    state.leftScore += score
    state.rightIntegrity = clamp(state.rightIntegrity - Math.max(damage, 0))
    state.leftIntegrity = clamp(state.leftIntegrity - Math.min(damage, 0))
    return
  }

  state.rightScore += score
  state.leftIntegrity = clamp(state.leftIntegrity - Math.max(damage, 0))
  state.rightIntegrity = clamp(state.rightIntegrity - Math.min(damage, 0))
}

function agentForSide(state: MatchState, side: Exclude<StreamSide, "system">): AgentDefinition {
  return side === "left" ? state.left : state.right
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function seededWinner(seed: string): Exclude<StreamSide, "system"> {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }

  return hash % 2 === 0 ? "left" : "right"
}

function timestamp(): string {
  return new Date().toISOString()
}
