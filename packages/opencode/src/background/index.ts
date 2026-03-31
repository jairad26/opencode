import { InstanceState } from "@/effect/instance-state"
import { makeRuntime } from "@/effect/run-service"
import { Identifier } from "@/id/id"
import { Instance } from "@/project/instance"
import { Shell } from "@/shell/shell"
import { Process } from "@/util/process"
import { Effect, Layer, ServiceMap } from "effect"
import z from "zod"

export namespace Background {
  export const Status = z.enum(["running", "completed", "failed", "cancelled"]).meta({
    ref: "BackgroundStatus",
  })

  export const Info = z
    .object({
      job_id: z.string(),
      command: z.string(),
      cwd: z.string(),
      status: Status,
      exit_code: z.number().nullable(),
    })
    .meta({
      ref: "BackgroundInfo",
    })

  export type Info = z.infer<typeof Info>

  export const StartInput = z
    .object({
      command: z.string(),
      cwd: z.string().optional(),
    })
    .meta({
      ref: "BackgroundStartInput",
    })

  export type StartInput = z.infer<typeof StartInput>

  type Job = {
    info: Info
    proc: Process.Child
    output: string
    stop: boolean
    done: Promise<void>
  }

  type State = {
    jobs: Map<string, Job>
  }

  export interface Interface {
    readonly start: (input: StartInput) => Effect.Effect<Info>
    readonly output: (job_id: string) => Effect.Effect<{ info: Info; output: string } | undefined>
    readonly cancel: (job_id: string) => Effect.Effect<boolean>
    readonly wait: (job_id: string, timeout?: number) => Effect.Effect<{ info: Info; output: string } | undefined>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Background") {}

  function copy(info: Info): Info {
    return {
      job_id: info.job_id,
      command: info.command,
      cwd: info.cwd,
      status: info.status,
      exit_code: info.exit_code,
    }
  }

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const state = yield* InstanceState.make<State>(
        Effect.fn("Background.state")(function* () {
          const value = {
            jobs: new Map<string, Job>(),
          }

          yield* Effect.addFinalizer(() =>
            Effect.promise(() =>
              Promise.all(
                Array.from(value.jobs.values()).map((job) => Process.stop(job.proc).catch(() => undefined)),
              ).then(() => undefined),
            ),
          )

          return value
        }),
      )

      const output = Effect.fn("Background.output")(function* (job_id: string) {
        const s = yield* InstanceState.get(state)
        const job = s.jobs.get(job_id)
        if (!job) return
        return {
          info: copy(job.info),
          output: job.output,
        }
      })

      const start = Effect.fn("Background.start")(function* (input: StartInput) {
        const s = yield* InstanceState.get(state)
        const cwd = input.cwd ?? Instance.worktree
        const job_id = Identifier.ascending("tool")
        const proc = Process.spawn([input.command], {
          cwd,
          shell: Shell.acceptable(),
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        })

        const info: Info = {
          job_id,
          command: input.command,
          cwd,
          status: "running",
          exit_code: null,
        }

        const job: Job = {
          info,
          proc,
          output: "",
          stop: false,
          done: Promise.resolve(),
        }

        const append = (chunk: Buffer) => {
          job.output += chunk.toString()
        }
        proc.stdout?.on("data", append)
        proc.stderr?.on("data", append)

        job.done = proc.exited
          .then((code) => {
            job.info.exit_code = code
            if (job.stop) {
              job.info.status = "cancelled"
              return
            }
            if (code === 0) {
              job.info.status = "completed"
              return
            }
            job.info.status = "failed"
          })
          .catch(() => {
            job.info.status = "failed"
            job.info.exit_code = 1
          })

        s.jobs.set(job_id, job)
        return copy(job.info)
      })

      const cancel = Effect.fn("Background.cancel")(function* (job_id: string) {
        const s = yield* InstanceState.get(state)
        const job = s.jobs.get(job_id)
        if (!job) return false
        if (job.info.status !== "running") return false
        job.stop = true
        yield* Effect.promise(() => Process.stop(job.proc).catch(() => undefined))
        return true
      })

      const wait = Effect.fn("Background.wait")(function* (job_id: string, timeout?: number) {
        const s = yield* InstanceState.get(state)
        const job = s.jobs.get(job_id)
        if (!job) return
        if (job.info.status === "running") {
          yield* Effect.promise(() => {
            if (timeout === undefined) return job.done
            if (timeout <= 0) return Promise.resolve()
            return Promise.race([
              job.done,
              new Promise<void>((resolve) => {
                setTimeout(resolve, timeout)
              }),
            ])
          })
        }
        return {
          info: copy(job.info),
          output: job.output,
        }
      })

      return Service.of({ start, output, cancel, wait })
    }),
  )

  const defaultLayer = layer
  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function start(input: StartInput) {
    return runPromise((svc) => svc.start(input))
  }

  export async function output(job_id: string) {
    return runPromise((svc) => svc.output(job_id))
  }

  export async function cancel(job_id: string) {
    return runPromise((svc) => svc.cancel(job_id))
  }

  export async function wait(job_id: string, timeout?: number) {
    return runPromise((svc) => svc.wait(job_id, timeout))
  }
}
