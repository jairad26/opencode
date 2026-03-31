import z from "zod"
import { Tool } from "./tool"
import { Session } from "../session"

export const SessionSearchTool = Tool.define("session_search", {
  description: "Search local OpenCode sessions by title across discovered databases.",
  parameters: z.object({
    query: z.string(),
    limit: z.coerce.number().optional(),
    directory: z.string().optional(),
    archived: z.coerce.boolean().optional(),
  }),
  async execute(input) {
    const items = [
      ...Session.discover({
        directory: input.directory,
        search: input.query,
        limit: input.limit,
        archived: input.archived,
      }),
    ]
    return {
      title: "Session search",
      output: JSON.stringify(items, null, 2),
      metadata: {},
    }
  },
})
