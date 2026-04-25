import { encodeSse, generateMatchEvents } from "@/lib/match-events"

export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await context.params
  const url = new URL(request.url)
  const left = url.searchParams.get("left")
  const right = url.searchParams.get("right")
  const task = url.searchParams.get("task")
  const iterator = generateMatchEvents(matchId, left, right, task)

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
