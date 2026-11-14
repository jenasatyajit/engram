/**
 * End-to-end check of the editor's branch / revise flow in headless Edge.
 * Point it at a server that uses a THROWAWAY database (not Turso):
 *
 *   node scripts/e2e-editor.mjs http://localhost:3222
 *
 * Requires Edge (or set EDGE_PATH). Screenshots go to ./.e2e/.
 */
import { spawn } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const BASE = process.argv[2] ?? "http://localhost:3222"
const EDGE = process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
const PORT = 9334
const profile = join(tmpdir(), `engram-e2e-profile-${Date.now()}`)
mkdirSync(".e2e", { recursive: true })

const browser = spawn(EDGE, ["--headless", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
  if (!ok) failures++
}

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
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
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value
const shot = async (name) => {
  const s = await send("Page.captureScreenshot", { format: "png" })
  writeFileSync(`.e2e/${name}.png`, Buffer.from(s.data, "base64"))
}
const type = (text) => send("Input.insertText", { text })
const key = async (modifiers = 0) => {
  const base = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers }
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base })
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base })
}
const ALT = 1, CTRL = 2, SHIFT = 8
const focus = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
const bodyText = () => evaluate(`document.querySelector('#thought-body').value`)
const crumbs = () => evaluate(`[...document.querySelectorAll('nav[aria-label=breadcrumb] li')].map(l=>l.textContent.trim()).filter(Boolean)`)
const chips = () => evaluate(`[...document.querySelectorAll('nav[aria-label=Branches] button')].map(b=>b.textContent.trim())`)
const barText = () => evaluate(`document.querySelector('[aria-label="Unsaved changes"]')?.textContent ?? null`)
const clickButton = (text) => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`)
const settle = () => wait(1200)

await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
await send("Page.navigate", { url: BASE })
await wait(1500)
// Keep e2e runs offline: turn the AI toggle off so no OpenRouter calls are made.
await evaluate(`localStorage.setItem("engram:ai-enabled", "0")`)
await send("Page.reload")
await wait(2500)

// 1. New board: title, then first thought.
await focus("textarea[aria-label=Title]")
await type("Should I learn Rust?")
await key() // Enter moves to the body (title commits on blur)
await settle()
const boardPath = await evaluate("location.pathname")
check("typing a title creates the board", /^\/b\/[0-9a-f-]{36}$/.test(boardPath), boardPath)

await type("Rust is worth learning for systems work.")
check("a new thought shows the Save bar", (await barText())?.includes("New thought"), await barText())
await key(CTRL)
await settle()
check("Ctrl+Enter saves the first thought", (await barText()) === null)
check("breadcrumb shows the saved thought", (await crumbs()).join(" > ").includes("Rust is worth"), (await crumbs()).join(" > "))
await shot("1-first-thought")

// 2. Revise.
await focus("#thought-body")
await type(" Mostly for CLIs.")
check("editing shows the Edited bar", (await barText())?.includes("Edited"))
await evaluate(`(()=>{const i=document.querySelector('input[aria-label="Why did this change?"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'narrowed scope');i.dispatchEvent(new Event('input',{bubbles:true}))})()`)
await focus("#thought-body")
await key(CTRL)
await settle()
check("Ctrl+Enter revises (v2 shown)", await evaluate(`document.body.innerText.includes('v2')`))

// 3. New branch from root, leave it via breadcrumb: auto-saves as a child.
await key(ALT)
await settle()
check("Alt+Enter opens an empty new branch", (await bodyText()) === "" && (await crumbs()).at(-1) === "New branch", (await crumbs()).join(" > "))
await type("Go might be faster to learn.")
await evaluate(`document.querySelector('nav[aria-label=breadcrumb] button').click()`)
await settle()
check("leaving a new branch saves it as a child", (await evaluate([...document.querySelectorAll('nav[aria-label=Branches] button')].some(b=>(b.title||'').startsWith('Go might be')))), (await chips()).join(" | "))
check("back on the root after leaving", (await bodyText()).startsWith("Rust is worth"))

// 4. Branch instead: the original stays untouched.
const rootBefore = await bodyText()
await focus("#thought-body")
await type(" But maybe not.")
await key(CTRL | SHIFT)
await settle()
check("Branch instead opens the new child", (await bodyText()).endsWith("But maybe not."))
await evaluate(`document.querySelector('nav[aria-label=breadcrumb] button').click()`)
await settle()
check("Branch instead leaves the original text unchanged", (await bodyText()) === rootBefore)
check("root now has two branches", (await chips()).filter((c) => !c.includes("New branch")).length === 2, (await chips()).join(" | "))

// 5. Leave with unsaved edits via a chip: auto-saved revise.
await focus("#thought-body")
await type(" (edited, then left)")
await evaluate(`[...document.querySelectorAll('nav[aria-label=Branches] button')].find(b=>(b.title||b.textContent).includes('Go might'))?.click()`)
await settle()
await evaluate(`document.querySelector('nav[aria-label=breadcrumb] button').click()`)
await settle()
check("leaving with edits saved them as a revise", (await bodyText()).endsWith("(edited, then left)"))
await evaluate(`document.querySelector('[aria-label="Thought options"]').click()`)
await wait(400)
await clickButton("Version history") || (await evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.includes('Version history'))?.click()`))
await wait(1500)
const history = await evaluate(`document.querySelector('[data-slot=sheet-content]')?.innerText ?? ''`)
check("history lists 3 versions with the note and an auto-saved mark", history.includes("v3") && history.includes("auto-saved") && history.includes("narrowed scope"), history.replace(/\s+/g, " ").slice(0, 120))
await shot("2-history")
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
await wait(500)

// 6. Unsaved draft survives a reload.
await focus("#thought-body")
await type(" DRAFT")
await wait(300)
await send("Page.reload")
await wait(3000)
check("unsaved draft is restored after reload", (await bodyText()).endsWith(" DRAFT") && (await barText())?.includes("Edited"))
await clickButton("Discard")
await wait(300)
check("Discard reverts to the saved text", !(await bodyText()).endsWith(" DRAFT") && (await barText()) === null)

// 7. Delete a branch, then undo.
await evaluate(`[...document.querySelectorAll('nav[aria-label=Branches] button')].find(b=>(b.title||b.textContent).includes('Go might'))?.click()`)
await settle()
await evaluate(`document.querySelector('[aria-label="Thought options"]').click()`)
await wait(400)
await evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.includes('Delete'))?.click()`)
await settle()
check("deleting a branch returns to its parent", (await bodyText()).startsWith("Rust is worth"))
check("the deleted branch is gone from the chips", !(await evaluate([...document.querySelectorAll('nav[aria-label=Branches] button')].some(b=>(b.title||'').startsWith('Go might')))))
await shot("3-deleted-toast")
await clickButton("Undo")
await settle()
check("Undo restores the branch and opens it", (await bodyText()).startsWith("Go might"))
await shot("4-final")

// 8. Graph view. Opening it counts as leaving the node, so edits auto-save first.
await focus("#thought-body")
await type(" Saved by opening the graph.")
await evaluate(`document.querySelector('button[aria-label="View graph"]').click()`)
await wait(4500) // let the physics settle and the view fit
check("the graph replaces the editor", await evaluate(`!!document.querySelector('[data-testid=board-graph] canvas') && !document.querySelector('#thought-body')`))
check("the graph shows every thought", await evaluate(`document.body.innerText.includes('3 thoughts')`))
await shot("5-graph-free")

const target = await evaluate(`(()=>{const n=window.__engramGraph?.nodes().find(n=>n.depth===0); return n ? {id:n.id, at: window.__engramGraph.screenOf(n.id)} : null})()`)
check("a node can be located on the canvas", !!target?.at, JSON.stringify(target?.at))
if (target?.at) {
  const { x, y } = target.at
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y })
  await wait(300)
  await shot("6-graph-hover")
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 })
  await settle()
  check("clicking a node opens it in the editor", (await bodyText())?.startsWith("Rust is worth learning"), (await bodyText())?.slice(0, 40))
}

await evaluate(`[...document.querySelectorAll('nav[aria-label=Branches] button')].find(b=>(b.title||b.textContent).includes('Go might'))?.click()`)
await settle()
check("edits made before opening the graph were saved", (await bodyText()).endsWith("Saved by opening the graph.") && (await barText()) === null)

await evaluate(`document.querySelector('button[aria-label="View graph"]').click()`)
await wait(1500)
await evaluate(`[...document.querySelectorAll('[aria-label="Graph layout"] button')].find(b=>b.textContent.trim()==='Tree')?.click()`)
await wait(4000)
check("Tree layout can be selected", await evaluate(`[...document.querySelectorAll('[aria-label="Graph layout"] button')].find(b=>b.textContent.trim()==='Tree')?.getAttribute('aria-pressed') === 'true'`))
await shot("7-graph-tree")
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
await wait(800)
check("Esc returns to the editor", await evaluate(`!!document.querySelector('#thought-body')`))

// 9. Boards sidebar.
const sidebarWidth = () => evaluate(`Math.round(document.querySelector('aside[aria-label=Boards]').getBoundingClientRect().width)`)
const agentVisible = () => evaluate(`!!document.querySelector('section[aria-label=Agent]')`)
const sidebarText = () => evaluate(`document.querySelector('aside[aria-label=Boards]').innerText`)
check("sidebar starts closed", (await sidebarWidth()) === 0, String(await sidebarWidth()))
check("agent space is visible while the sidebar is closed", await agentVisible())

await evaluate(`document.querySelector('button[aria-label="Open sidebar"]').click()`)
await wait(900)
check("toggle opens the sidebar to full width", (await sidebarWidth()) === 280, String(await sidebarWidth()))
check("agent space closes while the sidebar is open", !(await agentVisible()))
check("the editor is pushed aside, not covered", await evaluate(`document.querySelector('textarea[aria-label=Title]').getBoundingClientRect().left > 280`))
await shot("8-sidebar-open")
const firstBoardPath = await evaluate("location.pathname")
check("the current board is listed and its thoughts show in the dropdown", (await sidebarText()).includes("Should I learn Rust?") && (await sidebarText()).includes("B1: "))

// Open a thought from the sidebar tree.
await evaluate(`[...document.querySelectorAll('aside[aria-label=Boards] [data-sidebar=menu-sub-button]')].find(b=>(b.title||b.textContent).startsWith('Go might'))?.click()`)
await settle()
check("clicking a thought in the sidebar opens it", (await bodyText()).startsWith("Go might"))

// New board, then the list shows both boards.
await evaluate(`[...document.querySelectorAll('aside[aria-label=Boards] button')].find(b=>b.textContent.trim()==='New board')?.click()`)
await wait(2500)
check("New board opens an empty board", (await evaluate("location.pathname")) === "/" && (await bodyText()) === "")
check("sidebar stays open on the new board", (await sidebarWidth()) === 280)
await focus("textarea[aria-label=Title]")
await type("Second board")
await key()
await wait(2500)
check("the new board appears in the sidebar", (await sidebarText()).includes("Second board"))

// Search filters boards by title.
await evaluate(`(()=>{const i=document.querySelector('input[aria-label="Search boards"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'rust');i.dispatchEvent(new Event('input',{bubbles:true}))})()`)
await wait(400)
check("search filters boards by title", (await sidebarText()).includes("Should I learn Rust?") && !(await sidebarText()).includes("Second board"))
await shot("9-sidebar-search")
await evaluate(`(()=>{const i=document.querySelector('input[aria-label="Search boards"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}))})()`)
await wait(300)

// Switch boards from the sidebar.
await evaluate(`[...document.querySelectorAll('aside[aria-label=Boards] [data-sidebar=menu-button]')].find(b=>b.textContent.includes('Should I learn Rust?'))?.click()`)
await wait(3000)
check("clicking a board opens it", (await evaluate("location.pathname")) === firstBoardPath)

// The open/closed state is remembered across reloads.
await send("Page.reload")
await wait(3000)
check("sidebar is still open after a reload", (await sidebarWidth()) === 280)

// Rename and delete (with undo) another board from its menu.
const openMenuOf = (name) => evaluate(`(()=>{const li=[...document.querySelectorAll('aside[aria-label=Boards] [data-sidebar=menu-item]')].find(li=>li.querySelector('[data-sidebar=menu-button]')?.textContent.includes(${JSON.stringify(name)}));li?.querySelector('button[aria-label="Board options"]')?.click();return !!li})()`)
await openMenuOf("Second board")
await wait(400)
await evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.includes('Rename'))?.click()`)
await wait(400)
await evaluate(`(()=>{const i=document.querySelector('input[aria-label="Board name"]');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,'Renamed board');i.dispatchEvent(new Event('input',{bubbles:true}))})()`)
await focus('input[aria-label="Board name"]')
await key()
await wait(1500)
check("a board can be renamed from the sidebar", (await sidebarText()).includes("Renamed board"))

await openMenuOf("Renamed board")
await wait(400)
await evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(i=>i.textContent.includes('Delete'))?.click()`)
await wait(1500)
check("deleting a board removes it from the list", !(await sidebarText()).includes("Renamed board"))
await clickButton("Undo")
await wait(1500)
check("Undo brings the board back", (await sidebarText()).includes("Renamed board"))

// Closing the sidebar brings the agent space back.
await evaluate(`document.querySelector('button[aria-label="Close sidebar"]').click()`)
await wait(900)
check("closing the sidebar brings back the agent space", (await sidebarWidth()) === 0 && (await agentVisible()))

ws.close()
browser.kill()
await wait(500)
try { rmSync(profile, { recursive: true, force: true }) } catch {}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed")
process.exit(failures ? 1 : 0)
