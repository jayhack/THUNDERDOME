import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { parse } from "dotenv"

export type SecretPresence = {
  openai: boolean
  anthropic: boolean
  moonshot: boolean
  e2b: boolean
}

export function getSecretPresence(): SecretPresence {
  return {
    openai: hasSecret("OPENAI_API_KEY"),
    anthropic: hasSecret("ANTHROPIC_API_KEY"),
    moonshot: hasSecret("MOONSHOT_API_KEY") || hasSecret("KIMI_API_KEY"),
    e2b: hasSecret("E2B_API_KEY"),
  }
}

export function getSecretValue(name: string): string | undefined {
  const localValue = readLocalEnv()[name]?.trim()

  if (localValue) {
    return localValue
  }

  const envValue = process.env[name]?.trim()

  return envValue || undefined
}

function hasSecret(name: string): boolean {
  return typeof getSecretValue(name) === "string"
}

function readLocalEnv(): Record<string, string> {
  const env: Record<string, string> = {}

  for (const file of [".env", ".env.local"]) {
    const path = join(/* turbopackIgnore: true */ process.cwd(), file)

    if (!existsSync(path)) {
      continue
    }

    Object.assign(env, parse(readFileSync(path)))
  }

  return env
}
