import z from "zod"
import { Tool } from "./tool"
import { Session } from "../session"

export const SessionListTool = Tool.define("session_list", {
  description: "List local OpenCode sessions across discovered databases.",
  parameters: z.object({
    directory: z.string().optional(),
    query: z.string().optional(),
    roots: z.coerce.boolean().optional(),
    limit: z.coerce.number().optional(),
    archived: z.coerce.boolean().optional(),
  }),
  async execute(input) {
    const items = [
      ...Session.discover({
        directory: input.directory,
        search: input.query,
        roots: input.roots,
        limit: input.limit,
        archived: input.archived,
      }),
    ]
    return {
      title: "Sessions",
      output: JSON.stringify(items, null, 2),
      metadata: {},
    }
  },
})
