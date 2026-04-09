import { Effect, Layer, Schema, ServiceMap, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import * as CrossSpawnSpawner from "@/effect/cross-spawn-spawner"
import { makeRuntime } from "@/effect/run-service"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import path from "path"
import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Flag } from "../flag/flag"
import { Log } from "../util/log"
import { CHANNEL as channel, VERSION as version } from "./meta"

import semver from "semver"

export namespace Installation {
  const log = Log.create({ service: "installation" })

  const FORK_REPO = "jairad26/opencode"
  const FORK_BRANCH = "dev"

  export type Method = "git" | "unknown"

  export type ReleaseType = "patch" | "minor" | "major"

  export const Event = {
    Updated: BusEvent.define(
      "installation.updated",
      z.object({
        version: z.string(),
      }),
    ),
    UpdateAvailable: BusEvent.define(
      "installation.update-available",
      z.object({
        version: z.string(),
      }),
    ),
  }

  export function getReleaseType(current: string, latest: string): ReleaseType {
    const currMajor = semver.major(current)
    const currMinor = semver.minor(current)
    const newMajor = semver.major(latest)
    const newMinor = semver.minor(latest)

    if (newMajor > currMajor) return "major"
    if (newMinor > currMinor) return "minor"
    return "patch"
  }

  export const Info = z
    .object({
      version: z.string(),
      latest: z.string(),
    })
    .meta({
      ref: "InstallationInfo",
    })
  export type Info = z.infer<typeof Info>

  export const VERSION = version
  export const CHANNEL = channel
  export const USER_AGENT = `opencode/${CHANNEL}/${VERSION}/${Flag.OPENCODE_CLIENT}`

  export function isPreview() {
    return CHANNEL !== "latest"
  }

  export function isLocal() {
    return CHANNEL === "local"
  }

  export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
    stderr: Schema.String,
  }) {}

  const GitHubRelease = Schema.Struct({ tag_name: Schema.String })

  export interface Interface {
    readonly info: () => Effect.Effect<Info>
    readonly method: () => Effect.Effect<Method>
    readonly latest: (method?: Method) => Effect.Effect<string>
    readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Installation") {}

  function repoRoot(): string {
    let dir = path.dirname(process.argv[1] || __filename)
    for (let i = 0; i < 10; i++) {
      if (Bun.file(path.join(dir, "package.json")).size) {
        if (Bun.file(path.join(dir, "packages", "opencode", "package.json")).size) return dir
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return path.resolve(__dirname, "../../../..")
  }

  export const layer: Layer.Layer<Service, never, HttpClient.HttpClient | ChildProcessSpawner.ChildProcessSpawner> =
    Layer.effect(
      Service,
      Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient
        const httpOk = HttpClient.filterStatusOk(withTransientReadRetry(http))
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

        const text = Effect.fnUntraced(
          function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
            const proc = ChildProcess.make(cmd[0], cmd.slice(1), {
              cwd: opts?.cwd,
              env: opts?.env,
              extendEnv: true,
            })
            const handle = yield* spawner.spawn(proc)
            const out = yield* Stream.mkString(Stream.decodeText(handle.stdout))
            yield* handle.exitCode
            return out
          },
          Effect.scoped,
          Effect.catch(() => Effect.succeed("")),
        )

        const run = Effect.fnUntraced(
          function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
            const proc = ChildProcess.make(cmd[0], cmd.slice(1), {
              cwd: opts?.cwd,
              env: opts?.env,
              extendEnv: true,
            })
            const handle = yield* spawner.spawn(proc)
            const [stdout, stderr] = yield* Effect.all(
              [Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr))],
              { concurrency: 2 },
            )
            const code = yield* handle.exitCode
            return { code, stdout, stderr }
          },
          Effect.scoped,
          Effect.catch(() => Effect.succeed({ code: ChildProcessSpawner.ExitCode(1), stdout: "", stderr: "" })),
        )

        const root = repoRoot()

        const methodImpl = Effect.fn("Installation.method")(function* () {
          const result = yield* text(["git", "rev-parse", "--is-inside-work-tree"], { cwd: root })
          if (result.trim() === "true") return "git" as Method
          return "unknown" as Method
        })

        const latestImpl = Effect.fn("Installation.latest")(function* (_installMethod?: Method) {
          const response = yield* httpOk.execute(
            HttpClientRequest.get(`https://api.github.com/repos/${FORK_REPO}/releases/latest`).pipe(
              HttpClientRequest.acceptJson,
            ),
          )
          const data = yield* HttpClientResponse.schemaBodyJson(GitHubRelease)(response)
          return data.tag_name.replace(/^v/, "")
        }, Effect.orDie)

        const upgradeImpl = Effect.fn("Installation.upgrade")(function* (_m: Method, _target: string) {
          const fetch = yield* run(["git", "fetch", "origin", FORK_BRANCH], { cwd: root })
          if (fetch.code !== 0) return yield* new UpgradeFailedError({ stderr: fetch.stderr || "git fetch failed" })

          const pull = yield* run(["git", "pull", "origin", FORK_BRANCH, "--ff-only"], { cwd: root })
          if (pull.code !== 0) return yield* new UpgradeFailedError({ stderr: pull.stderr || "git pull failed" })

          const install = yield* run(["bun", "install"], { cwd: root })
          if (install.code !== 0)
            return yield* new UpgradeFailedError({ stderr: install.stderr || "bun install failed" })

          const build = yield* run(["bun", "run", "build"], { cwd: path.join(root, "packages", "opencode") })
          if (build.code !== 0) return yield* new UpgradeFailedError({ stderr: build.stderr || "bun run build failed" })

          log.info("upgraded", {
            method: "git",
            target: _target,
            stdout: pull.stdout,
            stderr: pull.stderr,
          })
        })

        return Service.of({
          info: Effect.fn("Installation.info")(function* () {
            return {
              version: VERSION,
              latest: yield* latestImpl(),
            }
          }),
          method: methodImpl,
          latest: latestImpl,
          upgrade: upgradeImpl,
        })
      }),
    )

  export const defaultLayer = layer.pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(CrossSpawnSpawner.defaultLayer),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function method(): Promise<Method> {
    return runPromise((svc) => svc.method())
  }

  export async function latest(installMethod?: Method): Promise<string> {
    return runPromise((svc) => svc.latest(installMethod))
  }

  export async function upgrade(m: Method, target: string): Promise<void> {
    return runPromise((svc) => svc.upgrade(m, target))
  }
}
