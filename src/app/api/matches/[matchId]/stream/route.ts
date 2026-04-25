import { generateCodexMatchEvents } from "@/lib/codex-match-events"
import { getRealArenaAgentId } from "@/lib/arena-data"
import { generateLiveMatchEvents } from "@/lib/live-match-events"
import { getCredentialSession } from "@/lib/match-credentials"
import { encodeSse, generateMatchEvents, type ArenaStreamEvent } from "@/lib/match-events"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await context.params
  const url = new URL(request.url)
  const left = url.searchParams.get("left")
  const right = url.searchParams.get("right")
  const task = url.searchParams.get("task")
  const mode = url.searchParams.get("mode")
  const credentialSessionId = url.searchParams.get("credentials")
  const credentials = getCredentialSession(credentialSessionId)
  const isRealCodexMode = mode !== "mock" && mode !== "mapped"
  const resolvedLeft = isRealCodexMode ? getRealArenaAgentId(left) : left
  const resolvedRight = isRealCodexMode ? getRealArenaAgentId(right) : right
  const iterator =
    credentialSessionId && !credentials
      ? generateCredentialSessionErrorEvents()
      : mode === "mock"
      ? generateMatchEvents(matchId, resolvedLeft, resolvedRight, task)
      : mode === "mapped"
        ? generateLiveMatchEvents(matchId, resolvedLeft, resolvedRight, task, credentials)
        : generateCodexMatchEvents(matchId, resolvedLeft, resolvedRight, task, credentials)

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next()

      if (done) {
        controller.close()
        return
      }

      controller.enqueue(encodeSse(value))
    },
    async cancel() {
      await iterator.return?.(undefined)
    },
  })

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  })
}

async function* generateCredentialSessionErrorEvents(): AsyncGenerator<ArenaStreamEvent> {
  yield {
    type: "error",
    message:
      "The arena credential session is missing or expired. Relaunch the match from the setup screen so the local server receives the keys again.",
    at: new Date().toISOString(),
  }
}
