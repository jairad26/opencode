// TEMPORARILY DISABLED: broken after anomalyco 1.5.2 sync - needs migration to new Tool.define API.
import z from "zod"
import * as Tool from "./tool"
import { Effect } from "effect"

export const DesktopTool = Tool.define(
  "desktop",
  Effect.succeed({
    description: "Native desktop automation (temporarily disabled).",
    parameters: z.object({}),
    execute: (_input: {}, _ctx: Tool.Context) =>
      Effect.die(new Error("desktop tool is temporarily disabled - pending API migration after anomalyco 1.5.2 sync")),
  }),
)
