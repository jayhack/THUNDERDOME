import { getSecretPresence } from "@/lib/server-secrets"

export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json({
    secrets: getSecretPresence(),
  })
}
