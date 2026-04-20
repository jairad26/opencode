// TEMPORARILY DISABLED: broken after anomalyco 1.5.2 sync - needs migration from ServiceMap to Context.Service.
import z from "zod"

export namespace Trigger {
  export const Info = z.object({
    id: z.string(),
    project_id: z.string(),
    workspace_id: z.string().nullable().optional(),
    session_id: z.string().nullable().optional(),
    name: z.string(),
    schedule: z.any(),
    action: z.any(),
    enabled: z.boolean(),
    created_at: z.number(),
    updated_at: z.number(),
    last: z
      .object({
        fired_at: z.number(),
        status: z.enum(["success", "failure"]),
        error: z.string().optional(),
      })
      .nullable()
      .optional(),
  })
  export type Info = z.infer<typeof Info>
}
