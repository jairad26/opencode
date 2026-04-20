// TEMPORARILY DISABLED: broken after anomalyco 1.5.2 sync - needs migration to new Tool.define API.
// Stub keeps registry.ts compiling. Runtime-only (execute) is the only thing that would fail.
import z from "zod"
import * as Tool from "./tool"
import { Effect } from "effect"

export const BriefTool = Tool.define(
  "brief",
  Effect.succeed({
    description: "Create a compact briefing of the current session using the active session context and model settings.",
    parameters: z.object({}),
    execute: (_input: {}, _ctx: Tool.Context) =>
      Effect.die(new Error("brief tool is temporarily disabled - pending API migration after anomalyco 1.5.2 sync")),
  }),
)
