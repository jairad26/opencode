// TEMPORARILY DISABLED: broken after anomalyco 1.5.2 sync - needs migration to new Tool.define API.
import z from "zod"
import * as Tool from "./tool"
import { Effect } from "effect"

export const EnterWorktreeTool = Tool.define(
  "worktree_enter",
  Effect.succeed({
    description: "Enter a git worktree sandbox (temporarily disabled).",
    parameters: z.object({}),
    execute: (_input: {}, _ctx: Tool.Context) =>
      Effect.die(new Error("worktree_enter tool is temporarily disabled - pending API migration after anomalyco 1.5.2 sync")),
  }),
)

export const ExitWorktreeTool = Tool.define(
  "worktree_exit",
  Effect.succeed({
    description: "Exit a git worktree sandbox (temporarily disabled).",
    parameters: z.object({}),
    execute: (_input: {}, _ctx: Tool.Context) =>
      Effect.die(new Error("worktree_exit tool is temporarily disabled - pending API migration after anomalyco 1.5.2 sync")),
  }),
)
