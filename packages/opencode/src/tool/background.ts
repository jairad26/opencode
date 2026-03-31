import z from "zod"
import { Tool } from "./tool"
import { Background } from "../background"
import START_DESCRIPTION from "./background-start.txt"
import OUTPUT_DESCRIPTION from "./background-output.txt"
import CANCEL_DESCRIPTION from "./background-cancel.txt"

const output = z.object({
  job_id: z.string().describe("Background job ID returned from background_start"),
  block: z.boolean().optional().describe("Wait for completion or timeout before returning"),
  timeout: z.number().optional().describe("Maximum wait time in milliseconds when block=true"),
})

const cancel = z.object({
  job_id: z.string().describe("Background job ID to cancel"),
})

export const BackgroundStartTool = Tool.define("background_start", {
  description: START_DESCRIPTION,
  parameters: Background.StartInput,
  async execute(input, ctx) {
    await ctx.ask({
      permission: "background_start",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const info = await Background.start(input)
    return {
      title: `Started background job ${info.job_id}`,
      output: [`job_id: ${info.job_id}`, `status: ${info.status}`].join("\n"),
      metadata: info,
    }
  },
})

export const BackgroundOutputTool = Tool.define("background_output", {
  description: OUTPUT_DESCRIPTION,
  parameters: output,
  async execute(input, _ctx) {
    const info = input.block
      ? await Background.wait(input.job_id, input.timeout)
      : await Background.output(input.job_id)
    if (!info) throw new Error(`Unknown background job: ${input.job_id}`)
    return {
      title: `Background job ${info.info.job_id}`,
      output: info.output,
      metadata: info.info,
    }
  },
})

export const BackgroundCancelTool = Tool.define("background_cancel", {
  description: CANCEL_DESCRIPTION,
  parameters: cancel,
  async execute(input, _ctx) {
    const cancelled = await Background.cancel(input.job_id)
    const info = await Background.output(input.job_id)
    return {
      title: cancelled ? `Cancelled ${input.job_id}` : `No running job for ${input.job_id}`,
      output: cancelled ? `Cancelled ${input.job_id}` : `Nothing to cancel for ${input.job_id}`,
      metadata: {
        job_id: input.job_id,
        cancelled,
        status: info?.info.status ?? "unknown",
      },
    }
  },
})
