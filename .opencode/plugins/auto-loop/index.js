// Project plugin: keeps this session working through .loop/plan.md on its own.
// `scripts/agent-loop arm` writes the state, this resumes at every idle until the
// plan has no unchecked item, the run cap is hit, or `.loop/STOP` appears.
import fs from "node:fs"
import path from "node:path"

const UNCHECKED = /^\s*[-*] \[ \]/m

const read = (file) => {
  try {
    return fs.readFileSync(file, "utf8")
  } catch {
    return undefined
  }
}

const number = (file, fallback) => {
  const value = Number.parseInt(read(file)?.trim() ?? "", 10)
  return Number.isFinite(value) ? value : fallback
}

const write = (file, text) => {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  } catch {}
}

const log = (file, text) => {
  try {
    fs.appendFileSync(file, `- ${new Date().toISOString()} ${text}\n`)
  } catch {}
}

const PROMPT = [
  "Autonomous loop: open .loop/plan.md and take the next unchecked item. Do it, run its check, tick the box.",
  "If it is blocked, write .loop/STOP with the reason instead of guessing.",
  "No commits, no pushes. Report in a few lines.",
].join(" ")

export default {
  id: "auto-loop",
  async setup(ctx) {
    if (!ctx?.event?.subscribe || typeof ctx.session?.prompt !== "function") return
    const loop = path.join(ctx.location.directory, ".loop")
    const file = (name) => path.join(loop, name)

    const resume = async (sessionID) => {
      if (typeof sessionID !== "string" || sessionID === "") return
      if (read(file("ARMED")) === undefined) return
      const owner = read(file("session"))?.trim() ?? ""
      if (owner !== "" && owner !== sessionID) return
      if (read(file("STOP")) !== undefined || read(file("DONE")) !== undefined) return

      const plan = read(file("plan.md"))
      if (plan === undefined || !UNCHECKED.test(plan)) {
        write(file("DONE"), `no unchecked item ${new Date().toISOString()}\n`)
        log(file("log.md"), "plan has no unchecked item; loop done")
        return
      }

      const runs = number(file("runs"), 0)
      const limit = number(file("limit"), 8)
      if (runs >= limit) {
        write(file("STOP"), `run cap ${limit} reached\n`)
        log(file("log.md"), `run cap ${limit} reached; stopped`)
        return
      }

      if (owner === "") write(file("session"), `${sessionID}\n`)
      write(file("runs"), `${runs + 1}\n`)
      log(file("log.md"), `resume ${runs + 1}/${limit} in ${sessionID}`)
      await ctx.session.prompt({ sessionID, text: PROMPT })
    }

    const controller = new AbortController()
    void (async () => {
      // This server has no `session.idle`: the end of a turn arrives as
      // `session.execution.succeeded`, measured on 2.2.7.
      for await (const event of ctx.event.subscribe({ types: ["session.execution.succeeded"], signal: controller.signal })) {
        try {
          await resume(event.data?.sessionID)
        } catch (error) {
          log(file("log.md"), `resume failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    })().catch(() => {})
    return () => controller.abort()
  },
}
