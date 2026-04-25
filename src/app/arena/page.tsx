import { ArenaClient } from "@/app/arena/arena-client"
import {
  defaultLeftAgent,
  defaultRightAgent,
  defaultTask,
  getAgent,
  getTask,
} from "@/lib/arena-data"

type ArenaPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ArenaPage({ searchParams }: ArenaPageProps) {
  const params = await searchParams
  const leftId = firstParam(params.left) ?? defaultLeftAgent
  const rightId = firstParam(params.right) ?? defaultRightAgent
  const taskId = firstParam(params.task) ?? defaultTask
  const matchId = firstParam(params.match) ?? crypto.randomUUID()
  const mode = firstParam(params.mode)
  const credentialSession = firstParam(params.credentials)

  return (
    <ArenaClient
      matchId={matchId}
      left={getAgent(leftId)}
      right={getAgent(rightId)}
      task={getTask(taskId)}
      mode={mode}
      credentialSession={credentialSession}
    />
  )
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}
