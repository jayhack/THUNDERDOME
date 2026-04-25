import { type ProviderId } from "@/lib/provider-tests"

export type MatchCredentialSecrets = Partial<Record<ProviderId, string>>

type StoredCredentialSession = {
  expiresAt: number
  secrets: MatchCredentialSecrets
}

const credentialStoreKey = "__thunderdomeCredentialSessions"
const credentialSessionTtlMs = 2 * 60 * 60 * 1000

const globalCredentialState = globalThis as typeof globalThis & {
  [credentialStoreKey]?: Map<string, StoredCredentialSession>
}

const credentialSessions =
  globalCredentialState[credentialStoreKey] ??
  (globalCredentialState[credentialStoreKey] = new Map<string, StoredCredentialSession>())

export function createCredentialSession(secrets: MatchCredentialSecrets): {
  id: string
  expiresAt: string
} {
  clearExpiredCredentialSessions()

  const id = crypto.randomUUID()
  const expiresAt = Date.now() + credentialSessionTtlMs

  credentialSessions.set(id, {
    expiresAt,
    secrets: trimSecrets(secrets),
  })

  return {
    id,
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

export function getCredentialSession(id: string | null): MatchCredentialSecrets | undefined {
  if (!id) {
    return undefined
  }

  const session = credentialSessions.get(id)

  if (!session) {
    return undefined
  }

  if (session.expiresAt <= Date.now()) {
    credentialSessions.delete(id)
    return undefined
  }

  return session.secrets
}

export function trimSecrets(secrets: MatchCredentialSecrets): MatchCredentialSecrets {
  return Object.fromEntries(
    Object.entries(secrets)
      .map(([provider, value]) => [provider, value?.trim()])
      .filter((entry): entry is [ProviderId, string] => Boolean(entry[1]))
  )
}

function clearExpiredCredentialSessions() {
  const now = Date.now()

  for (const [id, session] of credentialSessions) {
    if (session.expiresAt <= now) {
      credentialSessions.delete(id)
    }
  }
}
