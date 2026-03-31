import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readdir, rm } from "fs/promises"
import path from "path"
import { Database as Sqlite } from "bun:sqlite"
import { Global } from "../../src/global"
import { Instance } from "../../src/project/instance"
import { Database } from "../../src/storage/db"
import { MessageID, SessionID } from "../../src/session/schema"
import { tmpdir } from "../fixture/fixture"
import { SessionInfoTool } from "../../src/tool/session_info"
import { SessionListTool } from "../../src/tool/session_list"
import { SessionReadTool } from "../../src/tool/session_read"
import { SessionSearchTool } from "../../src/tool/session_search"

function seed(
  file: string,
  input: {
    project: { id: string; worktree: string; name?: string }
    session: { id: string; title: string; directory: string; updated: number }
    text: string
  },
) {
  const db = new Sqlite(file, { create: true })
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE project (
      id TEXT PRIMARY KEY,
      worktree TEXT NOT NULL,
      vcs TEXT,
      name TEXT,
      icon_url TEXT,
      icon_color TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      time_initialized INTEGER,
      sandboxes TEXT NOT NULL,
      commands TEXT
    );
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      workspace_id TEXT,
      parent_id TEXT,
      slug TEXT NOT NULL,
      directory TEXT NOT NULL,
      title TEXT NOT NULL,
      version TEXT NOT NULL,
      share_url TEXT,
      summary_additions INTEGER,
      summary_deletions INTEGER,
      summary_files INTEGER,
      summary_diffs TEXT,
      revert TEXT,
      permission TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      time_compacting INTEGER,
      time_archived INTEGER,
      FOREIGN KEY(project_id) REFERENCES project(id)
    );
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES session(id)
    );
    CREATE TABLE part (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL,
      FOREIGN KEY(message_id) REFERENCES message(id)
    );
  `)
  db.prepare(
    `INSERT INTO project (id, worktree, vcs, name, icon_url, icon_color, time_created, time_updated, time_initialized, sandboxes, commands)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.project.id,
    input.project.worktree,
    "git",
    input.project.name ?? null,
    null,
    null,
    input.session.updated,
    input.session.updated,
    null,
    JSON.stringify([]),
    null,
  )
  db.prepare(
    `INSERT INTO session (id, project_id, workspace_id, parent_id, slug, directory, title, version, share_url, summary_additions, summary_deletions, summary_files, summary_diffs, revert, permission, time_created, time_updated, time_compacting, time_archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.session.id,
    input.project.id,
    null,
    null,
    input.session.id,
    input.session.directory,
    input.session.title,
    "v2",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    input.session.updated,
    input.session.updated,
    null,
    null,
  )
  db.prepare(`INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)`).run(
    `msg-${input.session.id}`,
    input.session.id,
    input.session.updated,
    input.session.updated,
    JSON.stringify({ role: "user", sessionID: input.session.id, time: { created: input.session.updated } }),
  )
  db.prepare(
    `INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    `part-${input.session.id}`,
    `msg-${input.session.id}`,
    input.session.id,
    input.session.updated,
    input.session.updated,
    JSON.stringify({ type: "text", text: input.text }),
  )
  db.close()
}

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

afterEach(async () => {
  await Instance.disposeAll()
  Database.close()
  const items = await readdir(Global.Path.data).catch(() => [])
  await Promise.all(
    items
      .filter((item) => item.startsWith("opencode") && item.endsWith(".db"))
      .map((item) => rm(path.join(Global.Path.data, item), { force: true })),
  )
})

describe("session tools", () => {
  test("session_list returns sessions across local db files", async () => {
    await mkdir(Global.Path.data, { recursive: true })
    seed(path.join(Global.Path.data, "opencode.db"), {
      project: { id: "proj-root", worktree: "/tmp/root", name: "root" },
      session: { id: "ses-root", title: "root session", directory: "/tmp/root", updated: 10 },
      text: "root text",
    })
    seed(path.join(Global.Path.data, "opencode-dev.db"), {
      project: { id: "proj-dev", worktree: "/tmp/dev", name: "dev" },
      session: { id: "ses-dev", title: "dev session", directory: "/tmp/dev", updated: 20 },
      text: "dev text",
    })

    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SessionListTool.init()
        const result = await tool.execute({ limit: 10 }, ctx)
        expect(result.output).toContain("ses-dev")
        expect(result.output).toContain("ses-root")
      },
    })
  })

  test("session_search filters discovered sessions by query", async () => {
    await mkdir(Global.Path.data, { recursive: true })
    seed(path.join(Global.Path.data, "opencode.db"), {
      project: { id: "proj-root", worktree: "/tmp/root" },
      session: { id: "ses-root", title: "root session", directory: "/tmp/root", updated: 10 },
      text: "root text",
    })
    seed(path.join(Global.Path.data, "opencode-dev.db"), {
      project: { id: "proj-dev", worktree: "/tmp/dev" },
      session: { id: "ses-dev", title: "memory improvement", directory: "/tmp/dev", updated: 20 },
      text: "dev text",
    })

    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SessionSearchTool.init()
        const result = await tool.execute({ query: "memory", limit: 10 }, ctx)
        expect(result.output).toContain("ses-dev")
        expect(result.output).not.toContain("ses-root")
      },
    })
  })

  test("session_info returns metadata for one discovered session", async () => {
    await mkdir(Global.Path.data, { recursive: true })
    seed(path.join(Global.Path.data, "opencode-dev.db"), {
      project: { id: "proj-dev", worktree: "/tmp/dev", name: "dev" },
      session: { id: "ses-dev", title: "memory improvement", directory: "/tmp/dev", updated: 20 },
      text: "dev text",
    })

    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SessionInfoTool.init()
        const result = await tool.execute({ sessionID: "ses-dev" }, ctx)
        expect(result.output).toContain("memory improvement")
        expect(result.output).toContain("/tmp/dev")
      },
    })
  })

  test("session_read returns text parts for one discovered session", async () => {
    await mkdir(Global.Path.data, { recursive: true })
    seed(path.join(Global.Path.data, "opencode-dev.db"), {
      project: { id: "proj-dev", worktree: "/tmp/dev", name: "dev" },
      session: { id: "ses-dev", title: "memory improvement", directory: "/tmp/dev", updated: 20 },
      text: "please improve memory recall",
    })

    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await SessionReadTool.init()
        const result = await tool.execute({ sessionID: "ses-dev", limit: 20 }, ctx)
        expect(result.output).toContain("please improve memory recall")
      },
    })
  })
})
