import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, readdir, rm } from "fs/promises"
import path from "path"
import { Database as Sqlite } from "bun:sqlite"
import { Global } from "../../src/global"
import { Instance } from "../../src/project/instance"
import { Database } from "../../src/storage/db"
import { listItems } from "../../src/cli/cmd/session"
import { continueID } from "../../src/cli/cmd/run"
import { tmpdir } from "../fixture/fixture"

function seed(
  file: string,
  input: {
    project: { id: string; worktree: string; name?: string }
    session: { id: string; title: string; directory: string; updated: number }
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
  db.close()
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

describe("cli session helpers", () => {
  test("listItems returns discovered sessions for global search", async () => {
    await mkdir(Global.Path.data, { recursive: true })
    seed(path.join(Global.Path.data, "opencode.db"), {
      project: { id: "proj-root", worktree: "/tmp/root" },
      session: { id: "ses-root", title: "root session", directory: "/tmp/root", updated: 10 },
    })
    seed(path.join(Global.Path.data, "opencode-dev.db"), {
      project: { id: "proj-dev", worktree: "/tmp/dev" },
      session: { id: "ses-dev", title: "memory improvement", directory: "/tmp/dev", updated: 20 },
    })

    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessions = listItems({ global: true, search: "memory", limit: 10 })
        expect(sessions.map((x) => String(x.id))).toEqual(["ses-dev"])
      },
    })
  })

  test("continueID picks newest discovered root session matching search", async () => {
    await mkdir(Global.Path.data, { recursive: true })
    seed(path.join(Global.Path.data, "opencode.db"), {
      project: { id: "proj-root", worktree: "/tmp/root" },
      session: { id: "ses-root", title: "memory old", directory: "/tmp/root", updated: 10 },
    })
    seed(path.join(Global.Path.data, "opencode-dev.db"), {
      project: { id: "proj-dev", worktree: "/tmp/dev" },
      session: { id: "ses-dev", title: "memory latest", directory: "/tmp/dev", updated: 20 },
    })

    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const id = continueID({ search: "memory" })
        expect(String(id)).toBe("ses-dev")
      },
    })
  })
})
