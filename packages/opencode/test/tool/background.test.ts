import { afterEach, describe, expect, test } from "bun:test"
import { SessionID, MessageID } from "../../src/session/schema"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { ToolRegistry } from "../../src/tool/registry"
import { BackgroundStartTool, BackgroundOutputTool, BackgroundCancelTool } from "../../src/tool/background"
import type { Permission } from "../../src/permission"

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

afterEach(async () => {
  await Instance.disposeAll()
})

describe("tool.background", () => {
  test("registers background tools", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("background_start")
        expect(ids).toContain("background_output")
        expect(ids).toContain("background_cancel")
      },
    })
  })

  test("starts command and waits for output", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const req: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const start = await BackgroundStartTool.init()
        const output = await BackgroundOutputTool.init()
        const run = await start.execute(
          {
            command: `"${process.execPath}" -e "setTimeout(() => { console.log('done') }, 20)"`,
          },
          {
            ...ctx,
            ask: async (input: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
              req.push(input)
            },
          },
        )

        expect(req).toEqual([{ permission: "background_start", patterns: ["*"], always: ["*"], metadata: {} }])

        const done = await output.execute(
          {
            job_id: run.metadata.job_id,
            block: true,
            timeout: 2_000,
          },
          ctx,
        )

        expect(done.metadata.status).toBe("completed")
        expect(done.output).toContain("done")
      },
    })
  })

  test("cancels command", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const start = await BackgroundStartTool.init()
        const output = await BackgroundOutputTool.init()
        const cancel = await BackgroundCancelTool.init()

        const run = await start.execute(
          {
            command: `"${process.execPath}" -e "setTimeout(() => { console.log('late') }, 5000)"`,
          },
          ctx,
        )

        const stopped = await cancel.execute(
          {
            job_id: run.metadata.job_id,
          },
          ctx,
        )
        expect(stopped.metadata.cancelled).toBeTrue()

        const next = await output.execute(
          {
            job_id: run.metadata.job_id,
            block: true,
            timeout: 2_000,
          },
          ctx,
        )
        expect(next.metadata.status).toBe("cancelled")
      },
    })
  })
})
