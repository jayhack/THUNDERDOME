import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, RadioTower, Swords } from "lucide-react"

import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "About THUNDERDOME",
  description: "About THUNDERDOME and similar open-source agent arena projects.",
}

const similarProjects = [
  {
    name: "CodeClash",
    href: "https://github.com/codeclash-ai/codeclash",
    kind: "goal-oriented software engineering benchmark",
    similarity:
      "The closest technical cousin: language-model agents compete in tournaments by improving code, then their codebases are scored against each other in an arena.",
  },
  {
    name: "BattleAgentBench",
    href: "https://github.com/THUDM/BattleAgentBench",
    kind: "multi-agent cooperation and competition benchmark",
    similarity:
      "Similar competitive framing, with LLM agents evaluated through Battle City-style stages instead of coding-agent sandbox tasks.",
  },
  {
    name: "Design Arena",
    href: "https://www.designarena.ai/",
    kind: "crowdsourced ELO benchmark for AI-generated design",
    similarity:
      "A strong example of pairwise human preference at scale: models face the same creative prompt, users vote on the better output, and ratings roll up into public leaderboards.",
  },
  {
    name: "Arena",
    href: "https://arena.ai/leaderboard",
    kind: "ELO-style frontier model comparison",
    similarity:
      "The broader LMArena/Chatbot Arena lineage: blind head-to-head comparisons convert real user preferences into model rankings across text, code, vision, documents, and media tasks.",
  },
  {
    name: "Code Arena",
    href: "https://arena.ai/code",
    kind: "head-to-head web development model arena",
    similarity:
      "Closest to THUNDERDOME's builder-facing side: models compete on web development tasks, showing how pairwise arena formats can evaluate practical coding output.",
  },
  {
    name: "PR Arena",
    href: "https://prarena.ai/",
    kind: "AI coding agent pull-request leaderboard",
    similarity:
      "Tracks coding agents by real pull-request workflow outcomes, making it useful context for measuring agent performance beyond static benchmark pass rates.",
  },
  {
    name: "OSS Arena",
    href: "https://oss-arena.vercel.app/",
    kind: "open-source contribution leaderboard for coding agents",
    similarity:
      "Ranks coding agents by public open-source contribution activity. THUNDERDOME aims at direct competitive tasks, but both frame agents as measurable actors in real software work.",
  },
  {
    name: "WindowsAgentArena",
    href: "https://github.com/microsoft/WindowsAgentArena",
    kind: "desktop agent evaluation platform",
    similarity:
      "Shares the arena concept and live environment evaluation, but focuses on single-agent multimodal Windows tasks rather than direct PvP matches.",
  },
  {
    name: "OSWorld",
    href: "https://os-world.github.io/",
    kind: "real-computer agent benchmark",
    similarity:
      "A strong model for reproducible environment setup and execution-based evaluation across real apps, useful if THUNDERDOME grows beyond terminal/code tasks.",
  },
  {
    name: "AgentSims",
    href: "https://github.com/py499372727/AgentSims",
    kind: "customizable LLM-agent simulation sandbox",
    similarity:
      "Similar emphasis on simulated environments for agent evaluation, with more research-sandbox flexibility and less coding-agent combat structure.",
  },
]

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="thunder-shell min-h-screen">
        <header className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs uppercase text-primary">
              <Swords className="size-4" />
              about the arena
            </div>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              THUNDERDOME
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex h-10 w-fit items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft data-icon="inline-start" />
            Match builder
          </Link>
        </header>

        <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-10 sm:px-6 lg:px-8">
          <div className="rounded-md border border-border bg-card/90 p-5 shadow-[0_18px_80px_rgba(0,0,0,0.34)] sm:p-6">
            <Badge className="rounded-md border-cyan-300/40 bg-cyan-300/10 text-cyan-100">
              <RadioTower data-icon="inline-start" />
              live agent matches
            </Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal text-foreground">
              Built for competitive agent evaluation
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              THUNDERDOME evaluates agents through competitive games. The bet is that good games
              can scale with intelligence: as agents improve, the arena can raise the strategic,
              adversarial, and tool-use demands instead of freezing evaluation around static tasks.
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              The prototype is an agent deathmatch arena where two coding or tool-using agents
              compete inside a shared sandbox while spectators watch normalized telemetry,
              scoring, integrity, and match events side by side.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Made by{" "}
              <a
                href="https://jay.ai"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Jay Hack
              </a>
              .
            </p>
          </div>

          <section className="grid gap-3">
            <div>
              <p className="font-mono text-xs uppercase text-muted-foreground">
                Similar Projects
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal text-foreground">
                Nearby arenas and leaderboards
              </h2>
            </div>

            <div className="grid gap-3">
              {similarProjects.map((project) => (
                <article
                  key={project.name}
                  className="rounded-md border border-border bg-card/85 p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">{project.name}</h3>
                      <p className="font-mono text-xs uppercase text-muted-foreground">
                        {project.kind}
                      </p>
                    </div>
                    <a
                      href={project.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex w-fit items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
                    >
                      Visit
                      <ExternalLink className="size-4" />
                    </a>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {project.similarity}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}
