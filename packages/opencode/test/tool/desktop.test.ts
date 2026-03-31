import { describe, expect, mock, test } from "bun:test"

mock.module("@nut-tree-fork/nut-js", () => {
  throw new Error("mock nut-js unavailable")
})

const { DesktopTool } = await import("../../src/tool/desktop")

describe("DesktopTool", () => {
  test("initializes even when nut-js is unavailable", async () => {
    const tool = await DesktopTool.init()
    expect(tool.description).toBeTruthy()
  })
})
