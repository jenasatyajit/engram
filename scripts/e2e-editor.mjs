/**
 * End-to-end check of the editor's branch / revise flow in headless Edge.
 * Point it at a server that uses a THROWAWAY database (not Turso), prepared with
 * scripts/e2e-prepare.ts and started with ENGRAM_FAKE_AI=1 (offline, deterministic AI):
 *
 *   E2E_USER=e2e E2E_PASS=... node scripts/e2e-editor.mjs http://localhost:3222
 *
 * Requires Edge (or set EDGE_PATH). Screenshots go to ./.e2e/.
 */
import { spawn } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const BASE = process.argv[2] ?? "http://localhost:3222"
const EDGE =
  process.env.EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const PORT = 9334
const profile = join(tmpdir(), `engram-e2e-profile-${Date.now()}`)
mkdirSync(".e2e", { recursive: true })

const browser = spawn(
  EDGE,
  [
    "--headless",
    "--disable-gpu",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" }
)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const check = (name, ok, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`
  )
  if (!ok) failures++
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${PORT}/json`)
      ).json()
      const page = targets.find((t) => t.type === "page")
      if (page) return page.webSocketDebuggerUrl
    } catch {}
    await wait(250)
  }
  throw new Error("Edge did not start")
}

const ws = new WebSocket(await connect())
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = {}
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending[m.id]) pending[m.id](m.result ?? m.error)
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id
    pending[i] = r
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const evaluate = async (expression) =>
  (
    await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
  ).result?.value
const shot = async (name) => {
  const s = await send("Page.captureScreenshot", { format: "png" })
  writeFileSync(`.e2e/${name}.png`, Buffer.from(s.data, "base64"))
}
const type = (text) => send("Input.insertText", { text })
const key = async (modifiers = 0) => {
  const base = {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    modifiers,
  }
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base })
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base })
}
const ALT = 1,
  CTRL = 2,
  SHIFT = 8
const focus = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
// The body is CodeMirror: read its lines (pills show their title), minus the placeholder.
const bodyText = () =>
  evaluate(
    `(()=>{const c=document.querySelector('#thought-body').cloneNode(true);c.querySelectorAll('.cm-placeholder,.cm-widgetBuffer').forEach(e=>e.remove());return [...c.querySelectorAll('.cm-line')].map(l=>l.textContent).join('\\n')})()`
  )
const bodyPlaceholder = () =>
  evaluate(
    `document.querySelector('#thought-body .cm-placeholder')?.textContent ?? ''`
  )
const crumbs = () =>
  evaluate(
    `[...document.querySelectorAll('nav[aria-label=breadcrumb] li')].map(l=>l.textContent.trim()).filter(Boolean)`
  )
const chips = () =>
  evaluate(
    `[...document.querySelectorAll('nav[aria-label=Branches] button')].map(b=>b.textContent.trim())`
  )
const barText = () =>
  evaluate(
    `document.querySelector('[aria-label="Unsaved changes"]')?.textContent ?? null`
  )
const clickButton = (text) =>
  evaluate(
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`
  )
const settle = () => wait(1200)

await send("Emulation.setDeviceMetricsOverride", {
  width: 1400,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
// 0. Log in (every page needs a session since D23).
const USER = process.env.E2E_USER ?? "e2e"
const PASS = process.env.E2E_PASS ?? "e2e-password-123"
await send("Page.navigate", { url: `${BASE}/login` })
await wait(2500)
await evaluate(
  `(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;for(const [n,v] of [["username",${JSON.stringify(USER)}],["password",${JSON.stringify(PASS)}]]){const i=document.querySelector("input[name="+n+"]");set.call(i,v);i.dispatchEvent(new Event("input",{bubbles:true}))}document.querySelector("form button[type=submit]").click()})()`
)
await wait(3500)
check(
  "logs in",
  !(await evaluate("location.pathname")).startsWith("/login"),
  await evaluate("location.pathname")
)
// Start in Brainstorm with the AI toggle off; the Critic section turns AI on later (fake provider).
await evaluate(
  `localStorage.setItem("engram:ai-enabled", "0"); localStorage.setItem("engram:mode", "brainstorm")`
)
await send("Page.reload")
await wait(2500)

// 1. New board: title, then first thought.
await focus("textarea[aria-label=Title]")
await type("Should I learn Rust?")
await key() // Enter moves to the body (title commits on blur)
await settle()
const boardPath = await evaluate("location.pathname")
check(
  "typing a title creates the board",
  /^\/b\/[0-9a-f-]{36}$/.test(boardPath),
  boardPath
)

await type("Rust is worth learning for systems work.")
check(
  "a new thought shows the Save bar",
  (await barText())?.includes("New thought"),
  await barText()
)
await key(CTRL)
await settle()
check("Ctrl+Enter saves the first thought", (await barText()) === null)
check(
  "breadcrumb shows the saved thought",
  (await crumbs()).join(" > ").includes("Rust is worth"),
  (await crumbs()).join(" > ")
)
await shot("1-first-thought")

// 2. Revise.
await focus("#thought-body")
await type(" Mostly for CLIs.")
check("editing shows the Edited bar", (await barText())?.includes("Edited"))
await evaluate(
  `(()=>{const i=document.querySelector('input[aria-label="Why did this change?"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'narrowed scope');i.dispatchEvent(new Event('input',{bubbles:true}))})()`
)
await focus("#thought-body")
await key(CTRL)
await settle()
check(
  "Ctrl+Enter revises (v2 shown)",
  await evaluate(`document.body.innerText.includes('v2')`)
)

// 3. New branch from root, leave it via breadcrumb: auto-saves as a child.
await key(ALT)
await settle()
// A new branch shows its placeholder title "B<n>: <parent>" in the breadcrumb (D20).
check(
  "Alt+Enter opens an empty new branch",
  (await bodyText()) === "" && /^B1: /.test((await crumbs()).at(-1) ?? ""),
  (await crumbs()).join(" > ")
)
await type("Go might be faster to learn.")
await evaluate(
  `document.querySelector('nav[aria-label=breadcrumb] button').click()`
)
await settle()
check(
  "leaving a new branch saves it as a child",
  await evaluate(
    `[...document.querySelectorAll("nav[aria-label=Branches] button")].some(b=>(b.title||"").startsWith("Go might be"))`
  ),
  (await chips()).join(" | ")
)
check(
  "back on the root after leaving",
  (await bodyText()).startsWith("Rust is worth")
)

// 4. Branch instead: the original stays untouched.
const rootBefore = await bodyText()
await focus("#thought-body")
await type(" But maybe not.")
await key(CTRL | SHIFT)
await settle()
check(
  "Branch instead opens the new child",
  (await bodyText()).endsWith("But maybe not.")
)
await evaluate(
  `document.querySelector('nav[aria-label=breadcrumb] button').click()`
)
await settle()
check(
  "Branch instead leaves the original text unchanged",
  (await bodyText()) === rootBefore
)
check(
  "root now has two branches",
  (await chips()).filter((c) => !c.includes("New branch")).length === 2,
  (await chips()).join(" | ")
)

// 5. Leave with unsaved edits via a chip: auto-saved revise.
await focus("#thought-body")
await type(" (edited, then left)")
await evaluate(
  `[...document.querySelectorAll('nav[aria-label=Branches] button')].find(b=>(b.title||b.textContent).includes('Go might'))?.click()`
)
await settle()
await evaluate(
  `document.querySelector('nav[aria-label=breadcrumb] button').click()`
)
await settle()
check(
  "leaving with edits saved them as a revise",
  (await bodyText()).endsWith("(edited, then left)")
)
await evaluate(
  `document.querySelector('[aria-label="Thought options"]').click()`
)
await wait(400)
if (!(await clickButton("Version history"))) {
  await evaluate(
    `[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.includes('Version history'))?.click()`
  )
}
await wait(1500)
const history = await evaluate(
  `document.querySelector('[data-slot=sheet-content]')?.innerText ?? ''`
)
check(
  "history lists 3 versions with the note and an auto-saved mark",
  history.includes("v3") &&
    history.includes("auto-saved") &&
    history.includes("narrowed scope"),
  history.replace(/\s+/g, " ").slice(0, 120)
)
await shot("2-history")
await send("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Escape",
  code: "Escape",
  windowsVirtualKeyCode: 27,
})
await wait(500)

// 6. Unsaved draft survives a reload.
await focus("#thought-body")
await type(" DRAFT")
await wait(300)
await send("Page.reload")
await wait(3000)
check(
  "unsaved draft is restored after reload",
  (await bodyText()).endsWith(" DRAFT") && (await barText())?.includes("Edited")
)
await clickButton("Discard")
await wait(300)
check(
  "Discard reverts to the saved text",
  !(await bodyText()).endsWith(" DRAFT") && (await barText()) === null
)

// 7. Delete a branch, then undo.
await evaluate(
  `[...document.querySelectorAll('nav[aria-label=Branches] button')].find(b=>(b.title||b.textContent).includes('Go might'))?.click()`
)
await settle()
await evaluate(
  `document.querySelector('[aria-label="Thought options"]').click()`
)
await wait(400)
await evaluate(
  `[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.includes('Delete'))?.click()`
)
await settle()
check(
  "deleting a branch returns to its parent",
  (await bodyText()).startsWith("Rust is worth")
)
check(
  "the deleted branch is gone from the chips",
  !(await evaluate(
    `[...document.querySelectorAll("nav[aria-label=Branches] button")].some(b=>(b.title||"").startsWith("Go might"))`
  ))
)
await shot("3-deleted-toast")
await clickButton("Undo")
await settle()
check(
  "Undo restores the branch and opens it",
  (await bodyText()).startsWith("Go might")
)
await shot("4-final")

// 8. Graph view. Opening it counts as leaving the node, so edits auto-save first.
await focus("#thought-body")
await type(" Saved by opening the graph.")
await evaluate(
  `document.querySelector('button[aria-label="View graph"]').click()`
)
await wait(4500) // let the physics settle and the view fit
check(
  "the graph replaces the editor",
  await evaluate(
    `!!document.querySelector('[data-testid=board-graph] canvas') && !document.querySelector('#thought-body')`
  )
)
check(
  "the graph shows every thought",
  await evaluate(`document.body.innerText.includes('3 thoughts')`)
)
await shot("5-graph-free")

const target = await evaluate(
  `(()=>{const n=window.__engramGraph?.nodes().find(n=>n.depth===0); return n ? {id:n.id, at: window.__engramGraph.screenOf(n.id)} : null})()`
)
check(
  "a node can be located on the canvas",
  !!target?.at,
  JSON.stringify(target?.at)
)
if (target?.at) {
  const { x, y } = target.at
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y })
  await wait(300)
  await shot("6-graph-hover")
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  })
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  })
  await settle()
  check(
    "clicking a node opens it in the editor",
    (await bodyText())?.startsWith("Rust is worth learning"),
    (await bodyText())?.slice(0, 40)
  )
}

await evaluate(
  `[...document.querySelectorAll('nav[aria-label=Branches] button')].find(b=>(b.title||b.textContent).includes('Go might'))?.click()`
)
await settle()
check(
  "edits made before opening the graph were saved",
  (await bodyText()).endsWith("Saved by opening the graph.") &&
    (await barText()) === null
)

await evaluate(
  `document.querySelector('button[aria-label="View graph"]').click()`
)
await wait(1500)
await evaluate(
  `[...document.querySelectorAll('[aria-label="Graph layout"] button')].find(b=>b.textContent.trim()==='Tree')?.click()`
)
await wait(4000)
check(
  "Tree layout can be selected",
  await evaluate(
    `[...document.querySelectorAll('[aria-label="Graph layout"] button')].find(b=>b.textContent.trim()==='Tree')?.getAttribute('aria-pressed') === 'true'`
  )
)
await shot("7-graph-tree")
await send("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Escape",
  code: "Escape",
  windowsVirtualKeyCode: 27,
})
await wait(800)
check(
  "Esc returns to the editor",
  await evaluate(`!!document.querySelector('#thought-body')`)
)

// 9. Boards sidebar.
const sidebarWidth = () =>
  evaluate(
    `Math.round(document.querySelector('aside[aria-label=Boards]').getBoundingClientRect().width)`
  )
const agentVisible = () =>
  evaluate(`!!document.querySelector('section[aria-label=Agent]')`)
const sidebarText = () =>
  evaluate(`document.querySelector('aside[aria-label=Boards]').innerText`)
check(
  "sidebar starts closed",
  (await sidebarWidth()) === 0,
  String(await sidebarWidth())
)
check(
  "agent space is visible while the sidebar is closed",
  await agentVisible()
)

await evaluate(
  `document.querySelector('button[aria-label="Open sidebar"]').click()`
)
await wait(900)
check(
  "toggle opens the sidebar to full width",
  (await sidebarWidth()) === 280,
  String(await sidebarWidth())
)
check("agent space closes while the sidebar is open", !(await agentVisible()))
check(
  "the editor is pushed aside, not covered",
  await evaluate(
    `document.querySelector('textarea[aria-label=Title]').getBoundingClientRect().left > 280`
  )
)
await shot("8-sidebar-open")
const firstBoardPath = await evaluate("location.pathname")
check(
  "the current board is listed and its thoughts show in the dropdown",
  (await sidebarText()).includes("Should I learn Rust?") &&
    (await sidebarText()).includes("B1: ")
)

// Open a thought from the sidebar tree.
await evaluate(
  `[...document.querySelectorAll('aside[aria-label=Boards] [data-sidebar=menu-sub-button]')].find(b=>(b.title||b.textContent).startsWith('Go might'))?.click()`
)
await settle()
check(
  "clicking a thought in the sidebar opens it",
  (await bodyText()).startsWith("Go might")
)

// New board, then the list shows both boards.
await evaluate(
  `[...document.querySelectorAll('aside[aria-label=Boards] button')].find(b=>b.textContent.trim()==='New board')?.click()`
)
await wait(2500)
check(
  "New board opens an empty board",
  (await evaluate("location.pathname")) === "/" && (await bodyText()) === ""
)
check("sidebar stays open on the new board", (await sidebarWidth()) === 280)
await focus("textarea[aria-label=Title]")
await type("Second board")
await key()
await wait(2500)
check(
  "the new board appears in the sidebar",
  (await sidebarText()).includes("Second board")
)

// Search filters boards by title.
await evaluate(
  `(()=>{const i=document.querySelector('input[aria-label="Search boards"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'rust');i.dispatchEvent(new Event('input',{bubbles:true}))})()`
)
await wait(400)
check(
  "search filters boards by title",
  (await sidebarText()).includes("Should I learn Rust?") &&
    !(await sidebarText()).includes("Second board")
)
await shot("9-sidebar-search")
await evaluate(
  `(()=>{const i=document.querySelector('input[aria-label="Search boards"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}))})()`
)
await wait(300)

// Switch boards from the sidebar.
await evaluate(
  `[...document.querySelectorAll('aside[aria-label=Boards] [data-sidebar=menu-button]')].find(b=>b.textContent.includes('Should I learn Rust?'))?.click()`
)
await wait(3000)
check(
  "clicking a board opens it",
  (await evaluate("location.pathname")) === firstBoardPath
)

// The open/closed state is remembered across reloads.
await send("Page.reload")
await wait(3000)
check("sidebar is still open after a reload", (await sidebarWidth()) === 280)

// Rename and delete (with undo) another board from its menu.
const openMenuOf = (name) =>
  evaluate(
    `(()=>{const li=[...document.querySelectorAll('aside[aria-label=Boards] [data-sidebar=menu-item]')].find(li=>li.querySelector('[data-sidebar=menu-button]')?.textContent.includes(${JSON.stringify(name)}));li?.querySelector('button[aria-label="Board options"]')?.click();return !!li})()`
  )
await openMenuOf("Second board")
await wait(400)
await evaluate(
  `[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.includes('Rename'))?.click()`
)
await wait(400)
await evaluate(
  `(()=>{const i=document.querySelector('input[aria-label="Board name"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'Renamed board');i.dispatchEvent(new Event('input',{bubbles:true}))})()`
)
await focus('input[aria-label="Board name"]')
await key()
await wait(1500)
check(
  "a board can be renamed from the sidebar",
  (await sidebarText()).includes("Renamed board")
)

await openMenuOf("Renamed board")
await wait(400)
await evaluate(
  `[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.includes('Delete'))?.click()`
)
await wait(1500)
check(
  "deleting a board removes it from the list",
  !(await sidebarText()).includes("Renamed board")
)
await clickButton("Undo")
await wait(1500)
check(
  "Undo brings the board back",
  (await sidebarText()).includes("Renamed board")
)

// Closing the sidebar brings the agent space back.
await evaluate(
  `document.querySelector('button[aria-label="Close sidebar"]').click()`
)
await wait(900)
check(
  "closing the sidebar brings back the agent space",
  (await sidebarWidth()) === 0 && (await agentVisible())
)

// 10. Critic mode. The server runs with ENGRAM_FAKE_AI=1, so reviews are deterministic and offline.
const panelText = () =>
  evaluate(
    `document.querySelector("section[aria-label=Agent]")?.innerText ?? ""`
  )
const findingCount = () =>
  evaluate(
    `document.querySelectorAll("ul[aria-label='AI findings'] > li").length`
  )
const findingsText = () =>
  evaluate(
    `document.querySelector("ul[aria-label='AI findings']")?.innerText ?? ""`
  )
const toRoot = async () => {
  if (
    await evaluate(
      `!!document.querySelector("nav[aria-label=breadcrumb] button")`
    )
  ) {
    await evaluate(
      `document.querySelector("nav[aria-label=breadcrumb] button").click()`
    )
    await settle()
  }
}
const clickChip = (startsWith) =>
  evaluate(
    `[...document.querySelectorAll("nav[aria-label=Branches] button")].find(b=>b.textContent.trim().startsWith(${JSON.stringify(startsWith)}) || (b.title||"").startsWith(${JSON.stringify(startsWith)}))?.click()`
  )
const modePressed = () =>
  evaluate(
    `[...document.querySelectorAll("[aria-label=Mode] button")].find(b=>b.textContent.trim()==="Critic")?.getAttribute("aria-pressed")`
  )

await toRoot()
await evaluate(
  `[...document.querySelectorAll("[aria-label=Mode] button")].find(b=>b.textContent.trim()==="Critic")?.click()`
)
await wait(800)
const criticChips = (await chips()).join(" | ")
check(
  "Critic mode shows For, Against and Verdict on the claim",
  ["For", "Against", "Verdict"].every((l) =>
    criticChips.split(" | ").includes(l)
  ),
  criticChips
)
check(
  "with AI off, the mascot only watches",
  (await panelText()).includes("ai's off"),
  (await panelText()).slice(0, 80)
)

// A hand-written argument while AI is off: no review runs.
await clickChip("Against")
await settle()
check(
  "Against opens an empty argument slot",
  (await bodyText()) === "" &&
    (await barText()) === null &&
    (await bodyPlaceholder()) === "what's wrong with it?"
)
await type("Rust takes a long time to learn.")
check(
  "the bar names the new argument",
  (await barText())?.includes("New argument against"),
  await barText()
)
await toRoot()
check(
  "the owner's Against argument is saved under the claim with a red stance dot",
  await evaluate(
    `[...document.querySelectorAll("nav[aria-label=Branches] button")].some(b=>(b.title||"").startsWith("Rust takes") && b.querySelector("[aria-label=Against]"))`
  )
)
await wait(2000)
check("no AI review runs while AI is off", (await findingCount()) === 0)

// Turn AI on, add a For argument, leave it: the review runs and shows findings.
await evaluate(`document.querySelector("[aria-label='Toggle AI']").click()`)
await wait(600)
await clickChip("For")
await settle()
await type("Memory safety prevents whole classes of bugs.")
await toRoot()
await wait(5000)
check(
  "leaving a node in Critic mode runs a review and shows findings",
  (await findingCount()) === 2,
  String(await findingCount())
)
const found = await findingsText()
check(
  "the AI argument shows its server-attached source",
  found.includes("example.com") && found.includes("Fake counterpoint"),
  found.replace(/\s+/g, " ").slice(0, 160)
)
check(
  "findings are marked as AI-written",
  await evaluate(
    `[...document.querySelectorAll("ul[aria-label='AI findings'] [title='Written by AI']")].length === 2`
  )
)
await shot("10-critic-findings")

// Accept the AI argument (Against the For node), dismiss the hint.
await evaluate(
  `[...document.querySelectorAll("ul[aria-label='AI findings'] button")].find(b=>b.textContent.trim().startsWith("Add as"))?.click()`
)
await wait(2500)
check("accepting removes the card", (await findingCount()) === 1)
await evaluate(
  `[...document.querySelectorAll("ul[aria-label='AI findings'] button")].find(b=>b.textContent.trim()==="Dismiss")?.click()`
)
await wait(1500)
check("dismissing removes the last card", (await findingCount()) === 0)
check(
  "with nothing left, the mascot says the case holds up",
  (await panelText()).includes("no notes rn"),
  (await panelText()).slice(0, 80)
)

// The accepted argument is on the board, marked as AI.
await clickChip("Memory safety")
await settle()
check(
  "the accepted argument sits under the argument it attacks, marked AI",
  await evaluate(
    `[...document.querySelectorAll("nav[aria-label=Branches] button")].some(b=>b.textContent.includes("Fake counterpoint") && b.querySelector("[title='Written by AI']") && b.querySelector("[aria-label=Against]"))`
  )
)
await clickChip("Fake counterpoint")
await settle()
check(
  "its text carries the source link in its history",
  (await bodyText()).includes("Sources:") &&
    (await bodyText()).includes("https://example.com/engram-e2e-source")
)
check(
  "the node shows a Written by AI badge",
  await evaluate(`document.body.innerText.includes("Written by AI")`)
)
await shot("11-critic-ai-node")

// Plain navigation never asks for a review; a real edit asks exactly once.
await wait(3000)
const reviewRequests = () => evaluate("window.__engramReviewRequests ?? 0")
const beforeNav = await reviewRequests()
await toRoot()
await clickChip("Memory safety")
await settle()
await toRoot()
await evaluate(
  `document.querySelector('button[aria-label="View graph"]').click()`
)
await wait(1500)
await send("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Escape",
  code: "Escape",
  windowsVirtualKeyCode: 27,
})
await wait(3000)
check(
  "switching branches and opening the graph without edits makes no review calls",
  (await reviewRequests()) === beforeNav,
  `${beforeNav} -> ${await reviewRequests()}`
)
await focus("#thought-body")
await type(" Edited for real.")
await clickChip("Memory safety")
await wait(4500)
check(
  "a real edit followed by a leave makes exactly one review call",
  (await reviewRequests()) === beforeNav + 1,
  `${beforeNav} -> ${await reviewRequests()}`
)

// Leaving again triggers a new review; with the sidebar open, a dot flags waiting findings.
await toRoot()
await wait(5000)
check(
  "a new review ran after leaving",
  (await findingCount()) > 0,
  String(await findingCount())
)
await evaluate(
  `document.querySelector('button[aria-label="Open sidebar"]').click()`
)
await wait(900)
check(
  "with the sidebar open, a dot flags waiting findings",
  await evaluate(`!!document.querySelector("[data-testid=findings-dot]")`)
)
await evaluate(
  `document.querySelector('button[aria-label="Close sidebar"]').click()`
)
await wait(900)

// Mode is remembered; AI off hides findings.
await send("Page.reload")
await wait(3500)
check(
  "Critic mode is remembered after a reload",
  (await modePressed()) === "true"
)
await evaluate(`document.querySelector("[aria-label='Toggle AI']").click()`)
await wait(800)
check(
  "turning AI off hides the findings",
  (await findingCount()) === 0 && (await panelText()).includes("ai's off")
)

// Brainstorm is unchanged.
await evaluate(
  `[...document.querySelectorAll("[aria-label=Mode] button")].find(b=>b.textContent.trim()==="Brainstorm")?.click()`
)
await wait(600)
check(
  "Brainstorm brings back New branch",
  (await chips()).some((c) => c.startsWith("New branch"))
)

// 11. `[[` tags in the CodeMirror body (Brainstorm).
const typeKeys = async (text) => {
  for (const ch of text) {
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: ch,
      text: ch,
      unmodifiedText: ch,
    })
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch })
  }
  await wait(300)
}
const pressKey = async (name, vk) => {
  const base = { key: name, code: name, windowsVirtualKeyCode: vk }
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base })
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base })
  await wait(300)
}
const pickerRows = () =>
  evaluate(
    `[...document.querySelectorAll("[cmdk-item]")].map(i=>i.textContent.trim())`
  )
const pickerOpen = () => evaluate(`!!document.querySelector("[cmdk-root]")`)
const pills = () =>
  evaluate(
    `[...document.querySelectorAll("#thought-body .cm-mention")].map(p=>p.textContent.trim())`
  )

await focus("#thought-body")
await typeKeys(" see [[")
check(
  "typing [[ closes the brackets",
  (await bodyText()).endsWith("see [[]]"),
  await bodyText()
)
check("the tag picker opens", await pickerOpen())
await shot("tags-picker")
await typeKeys("Zeta idea")
const rowsNew = await pickerRows()
check(
  "an unknown name offers Create branch",
  rowsNew.length === 1 && rowsNew[0].startsWith("Create branch"),
  JSON.stringify(rowsNew)
)
await pressKey("Enter", 13)
await wait(2500)
check(
  "Enter creates the branch and inserts a pill",
  (await pills()).join("|") === "Zeta idea" && !(await pickerOpen()),
  JSON.stringify(await pills())
)
check(
  "the new branch shows in the chips",
  (await chips()).some((c) => c.includes("Zeta idea")),
  JSON.stringify(await chips())
)
await shot("tags-pill")

await typeKeys(" [[")
await pressKey("Backspace", 8)
check(
  "Backspace in an empty [[]] removes both pairs",
  !(await bodyText()).includes("[["),
  await bodyText()
)

await typeKeys("[[")
await typeKeys("z")
check("the picker lists matching thoughts", (await pickerRows()).length > 0)
await pressKey("Escape", 27)
check("Escape closes the picker", !(await pickerOpen()))

await evaluate(`document.querySelector("#thought-body .cm-mention").click()`)
await settle()
check(
  "clicking a pill opens that thought",
  (await crumbs()).some((c) => c.includes("Zeta idea")),
  JSON.stringify(await crumbs())
)
ws.close()
browser.kill()
await wait(500)
try {
  rmSync(profile, { recursive: true, force: true })
} catch {}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed")
process.exit(failures ? 1 : 0)
