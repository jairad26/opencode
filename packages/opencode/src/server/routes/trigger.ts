// TEMPORARILY DISABLED: broken after anomalyco 1.5.2 sync - needs migration from ServiceMap to Context.Service.
import { Hono } from "hono"
import { lazy } from "@/util/lazy"

export const TriggerRoutes = lazy(() => new Hono())
