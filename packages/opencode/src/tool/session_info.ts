import z from "zod"
import { Tool } from "./tool"
import { Session } from "../session"

export const SessionInfoTool = Tool.define("session_info", {
  description: "Get metadata for a local OpenCode session from discovered databases.",
  parameters: z.object({
    sessionID: z.string(),
  }),
  async execute(input) {
    const item = Session.info(input.sessionID)
    return {
      title: input.sessionID,
      output: JSON.stringify(item, null, 2),
      metadata: {},
    }
  },
})
