// TEMPORARILY DISABLED: broken after anomalyco 1.5.2 sync - needs migration to new Tool.define API.
import z from "zod"
import * as Tool from "./tool"
import { Effect } from "effect"

export const BrowserTool = Tool.define(
  "browser",
  Effect.succeed({
    description: "Headless browser automation (temporarily disabled).",
    parameters: z.object({}),
    execute: (_input: {}, _ctx: Tool.Context) =>
      Effect.die(new Error("browser tool is temporarily disabled - pending API migration after anomalyco 1.5.2 sync")),
  }),
)
