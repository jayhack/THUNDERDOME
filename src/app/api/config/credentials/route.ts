import {
  createCredentialSession,
  trimSecrets,
  type MatchCredentialSecrets,
} from "@/lib/match-credentials"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type CredentialSessionRequest = {
  keys?: MatchCredentialSecrets
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CredentialSessionRequest
  const secrets = trimSecrets(body.keys ?? {})

  if (Object.keys(secrets).length === 0) {
    return Response.json({ message: "No credentials were provided." }, { status: 400 })
  }

  const session = createCredentialSession(secrets)

  return Response.json({
    credentialSession: session.id,
    expiresAt: session.expiresAt,
  })
}
