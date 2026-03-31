import z from "zod"
import { Tool } from "./tool"
import { Session } from "../session"

export const SessionReadTool = Tool.define("session_read", {
  description: "Read messages from a local OpenCode session in discovered databases.",
  parameters: z.object({
    sessionID: z.string(),
    limit: z.coerce.number().optional(),
  }),
  async execute(input) {
    const session = Session.info(input.sessionID)
    const msgs = Session.read({ sessionID: input.sessionID, limit: input.limit })
    const output = [
      `Session: ${session.id}`,
      `Title: ${session.title}`,
      ...msgs.flatMap((msg) => {
        const role = typeof msg.info.role === "string" ? msg.info.role : "unknown"
        const text = msg.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n")
        return [`[${role}]`, text]
      }),
    ].join("\n")
    return {
      title: input.sessionID,
      output,
      metadata: {},
    }
  },
})
