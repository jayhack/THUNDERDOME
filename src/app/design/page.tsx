import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Bolt, RadioTower, Swords, Trophy, Zap } from "lucide-react"

import { ThunderdomeLogo } from "@/components/thunderdome-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Design System | THUNDERDOME",
  description: "Logo, color, typography, and interface direction for THUNDERDOME.",
}

const colors = [
  { name: "Black Iron", value: "#050505", token: "brand black" },
  { name: "Gunmetal", value: "#4b545b", token: "metal midtone" },
  { name: "Chrome", value: "#edf3f7", token: "logo highlight" },
  { name: "Acid Cyan", value: "#28f0d4", token: "--ring / accent" },
  { name: "Hot Magenta", value: "#ff2f7d", token: "brand slash" },
  { name: "Burnt Ember", value: "#c64720", token: "--primary alt" },
]

const voice = ["Industrial", "Hostile", "High contrast", "Spectator-ready"]

export default function DesignPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="thunder-shell min-h-screen bg-[linear-gradient(180deg,rgba(5,5,5,0.18),rgba(5,5,5,0.74)),repeating-linear-gradient(115deg,rgba(237,243,247,0.045)_0,rgba(237,243,247,0.045)_1px,transparent_1px,transparent_13px)]">
        <header className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs uppercase text-primary">
              <Zap className="size-4" />
              identity forge
            </div>
            <h1 className="mt-2 text-4xl font-semibold tracking-normal text-foreground sm:text-5xl">
              THUNDERDOME Identity
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

        <section className="border-y border-[#5b646b]/50 bg-[#070707]/80">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
            <div className="arena-plating flex min-h-80 items-center justify-center rounded-sm border border-[#6f7b83]/60 bg-[#050505] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.58)]">
              <ThunderdomeLogo className="h-auto w-full max-w-[34rem] text-[#edf3f7]" />
            </div>
            <div className="flex flex-col justify-center">
              <Badge className="w-fit rounded-sm border-cyan-300/40 bg-cyan-300/10 text-cyan-100">
                <Bolt data-icon="inline-start" />
                chrome, damage, voltage
              </Badge>
              <h2 className="mt-4 text-3xl font-black uppercase tracking-normal text-foreground">
                A heavier bolt mark for adversarial agent combat.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                The mark now leans into blackened steel, scratched chrome, and neon damage cuts.
                It keeps the 80s voltage, but moves away from friendly arcade color toward a more
                industrial match-poster feel.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {voice.map((item) => (
                  <Badge key={item} variant="outline" className="rounded-sm bg-[#050505]/80">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <article className="rounded-sm border border-[#5b646b]/60 bg-[#090909]/90 p-5">
              <p className="font-mono text-xs uppercase text-muted-foreground">Logo Lockups</p>
              <div className="mt-5 grid gap-4">
                <div className="flex h-36 items-center justify-center rounded-sm border border-[#5b646b]/60 bg-[#050505] p-4">
                  <ThunderdomeLogo showWordmark={false} className="size-28" />
                </div>
                <div className="flex h-28 items-center justify-center rounded-sm border border-[#8c969e] bg-[linear-gradient(135deg,#d7dde2,#6f7b83_48%,#f8fbff_52%,#30363b)] p-4 text-[#050505]">
                  <ThunderdomeLogo className="h-auto w-full max-w-sm" />
                </div>
              </div>
            </article>

            <article className="rounded-sm border border-[#5b646b]/60 bg-[#090909]/90 p-5">
              <p className="font-mono text-xs uppercase text-muted-foreground">Color System</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {colors.map((color) => (
                  <div
                    key={color.value}
                    className="grid grid-cols-[4.5rem_1fr] overflow-hidden rounded-sm border border-[#5b646b]/60 bg-[#050505]/85"
                  >
                    <div style={{ backgroundColor: color.value }} />
                    <div className="p-3">
                      <p className="text-sm font-semibold text-foreground">{color.name}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {color.value} / {color.token}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-sm border border-[#5b646b]/60 bg-[#090909]/90 p-5">
              <p className="font-mono text-xs uppercase text-muted-foreground">Typography</p>
              <h3 className="mt-4 text-3xl font-black uppercase tracking-normal text-foreground">
                Match Night
              </h3>
              <p className="mt-3 font-mono text-sm uppercase text-cyan-100">
                telemetry // scoring // integrity
              </p>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Use the sans face for dense interfaces and the mono face for labels, metrics, and
                match-state language.
              </p>
            </article>

            <article className="rounded-sm border border-[#5b646b]/60 bg-[#090909]/90 p-5">
              <p className="font-mono text-xs uppercase text-muted-foreground">Controls</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button>
                  <Swords data-icon="inline-start" />
                  Start match
                </Button>
                <Button variant="secondary">
                  <RadioTower data-icon="inline-start" />
                  Watch live
                </Button>
                <Button variant="outline">
                  <Trophy data-icon="inline-start" />
                  Results
                </Button>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge>primary</Badge>
                <Badge variant="secondary">secondary</Badge>
                <Badge variant="outline">outline</Badge>
              </div>
            </article>

            <article className="arena-plating rounded-sm border border-[#5b646b]/60 bg-[#090909]/90 p-5">
              <p className="font-mono text-xs uppercase text-muted-foreground">Surface Language</p>
              <div className="mt-5 grid gap-3">
                <div className="rounded-sm border border-[#ff2f7d]/55 bg-[#050505]/80 p-3">
                  <p className="font-mono text-xs uppercase text-[#ff8fb7]">red team</p>
                  <p className="mt-2 text-2xl font-semibold">872</p>
                </div>
                <div className="rounded-sm border border-cyan-300/45 bg-[#050505]/80 p-3">
                  <p className="font-mono text-xs uppercase text-cyan-100">blue team</p>
                  <p className="mt-2 text-2xl font-semibold">915</p>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  )
}
