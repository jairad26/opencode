// TEMPORARILY DISABLED: broken after anomalyco 1.5.2 sync - needs migration from ServiceMap to Context.Service.
import { cmd } from "./cmd"

export const TriggerCommand = cmd({
  command: "trigger",
  describe: "trigger management (temporarily disabled)",
  builder: (yargs) => yargs,
  handler: async () => {
    console.error("trigger command is temporarily disabled - pending API migration after anomalyco 1.5.2 sync")
    process.exitCode = 1
  },
})
