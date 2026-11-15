import { EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import { formatSpec } from "@/components/editor/format-extension"
import {
  FORMAT_COLORS,
  formatLine,
  parseLine,
  plainText,
  stripFormatting,
  type Attrs,
  type FormatOp,
} from "@/lib/board/formatting"
import { formatMention } from "@/lib/board/mentions"

const ID = "7bca14a8-72ae-441c-bb62-200cd77fcfe4"

const attrsAt = (line: string, text: string): Attrs => {
  const unit = parseLine(line).units.find((u) => u.from === line.indexOf(text))
  if (!unit) throw new Error(`no unit for ${text}`)
  return unit.attrs
}

describe("parseLine", () => {
  it("reads bold, italic, colour and highlight", () => {
    expect(attrsAt("a **b** c", "b").bold).toBe(true)
    expect(attrsAt("a *b* c", "b").italic).toBe(true)
    expect(attrsAt("a {c:red|b} c", "b").color).toBe("red")
    expect(attrsAt("a {h:yellow|b} c", "b").highlight).toBe("yellow")
  })

  it("nests formats, including ***both***", () => {
    const a = attrsAt("***x***", "x")
    expect([a.bold, a.italic]).toEqual([true, true])
    const b = attrsAt("{c:blue|**x**}", "x")
    expect([b.bold, b.color]).toEqual([true, "blue"])
    const c = attrsAt("**a*b***", "b")
    expect([c.bold, c.italic]).toEqual([true, true])
    expect(attrsAt("**a*b***", "a").italic).toBe(false)
  })

  it("leaves unmatched, spaced or empty markers as plain text", () => {
    for (const line of [
      "2 * 3 * 4",
      "**open only",
      "** spaced **",
      "****",
      "{c:red|open only",
      "{c:nope|x}",
      "{c:red|}",
      "a } b",
    ]) {
      expect(stripFormatting(line)).toBe(line)
    }
  })

  it("does not nest the same format twice", () => {
    // The inner {c:blue| stays literal text; the first } closes the red span.
    expect(stripFormatting("{c:red|a {c:blue|b} c}")).toBe("a {c:blue|b c}")
  })

  it("treats a [[tag]] as one unit and never reads inside it", () => {
    const tag = formatMention("Rust *basics*", ID)
    const { units } = parseLine(`**${tag}**`)
    expect(units).toHaveLength(1)
    expect(units[0].text).toBe(tag)
    expect(units[0].attrs.bold).toBe(true)
  })
})

describe("plain text", () => {
  it("strips markers on every line and keeps tags readable", () => {
    const tag = formatMention("Rust", ID)
    expect(plainText(`**Big** {h:red|idea}\nsee ${tag} and *this*`)).toBe(
      "Big idea\nsee [[Rust]] and this"
    )
  })
})

describe("formatLine", () => {
  const bold = (value: boolean): FormatOp => ({ type: "bold", value })

  it("wraps a selection and reports where it ends up", () => {
    const edit = formatLine("hello world", 6, 11, bold(true))!
    expect(edit.text).toBe("hello **world**")
    expect(edit.text.slice(edit.start, edit.end)).toBe("world")
  })

  it("splits a span when part of it is unformatted", () => {
    const edit = formatLine("**one two three**", 6, 9, bold(false))!
    expect(edit.text).toBe("**one** two **three**")
    expect(stripFormatting(edit.text)).toBe("one two three")
    expect(attrsAt(edit.text, "two").bold).toBe(false)
    expect(attrsAt(edit.text, "one").bold).toBe(true)
    expect(attrsAt(edit.text, "three").bold).toBe(true)
  })

  it("merges with neighbouring spans instead of stacking markers", () => {
    const edit = formatLine("**a** b", 0, 7, bold(true))!
    expect(edit.text).toBe("**a b**")
  })

  it("keeps bold off whitespace at the edges of the selection", () => {
    const edit = formatLine("a b c", 1, 4, bold(true))!
    expect(edit.text).toBe("a **b** c")
  })

  it("replaces a colour, and clears colours without touching bold", () => {
    const red = formatLine("**x**", 0, 5, { type: "color", name: "red" })!
    expect(attrsAt(red.text, "x")).toMatchObject({ bold: true, color: "red" })
    const blue = formatLine(red.text, 0, red.text.length, {
      type: "color",
      name: "blue",
    })!
    expect(attrsAt(blue.text, "x").color).toBe("blue")
    const cleared = formatLine(blue.text, 0, blue.text.length, {
      type: "clear",
      scope: "colors",
    })!
    expect(attrsAt(cleared.text, "x")).toMatchObject({
      bold: true,
      color: null,
    })
    const all = formatLine(cleared.text, 0, cleared.text.length, {
      type: "clear",
      scope: "all",
    })!
    expect(all.text).toBe("x")
  })

  it("formats around a tag without changing it", () => {
    const tag = formatMention("Rust", ID)
    const line = `see ${tag} now`
    const edit = formatLine(line, 4, 4 + tag.length, {
      type: "highlight",
      name: "yellow",
    })!
    expect(edit.text).toBe(`see {h:yellow|${tag}} now`)
  })

  it("does nothing when there is nothing to format", () => {
    expect(formatLine("abc", 1, 1, bold(true))).toBeNull()
    expect(formatLine("**a**", 0, 2, bold(true))).toBeNull()
  })

  it("never changes the visible text, whatever the input (fuzz)", () => {
    const pieces = ["a", "b", " ", "*", "**", "{c:red|", "{h:blue|", "}", "x y"]
    let seed = 12345
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % n
    }
    const ops: FormatOp[] = [
      { type: "bold", value: true },
      { type: "bold", value: false },
      { type: "italic", value: true },
      { type: "color", name: "green" },
      { type: "highlight", name: null },
      { type: "clear", scope: "all" },
    ]
    for (let i = 0; i < 600; i++) {
      let line = ""
      for (let k = rand(10); k >= 0; k--) line += pieces[rand(pieces.length)]
      const visible = stripFormatting(line)
      const a = rand(line.length + 1)
      const b = a + rand(line.length - a + 1)
      const edit = formatLine(line, a, b, ops[rand(ops.length)])
      if (edit) expect(stripFormatting(edit.text)).toBe(visible)
    }
  })

  it("accepts every palette colour", () => {
    for (const name of FORMAT_COLORS) {
      const edit = formatLine("x", 0, 1, { type: "color", name })!
      expect(edit.text).toBe(`{c:${name}|x}`)
    }
  })
})

describe("formatSpec", () => {
  const apply = (
    doc: string,
    from: number,
    to: number,
    op: Parameters<typeof formatSpec>[1]
  ) => {
    const state = EditorState.create({
      doc,
      selection: { anchor: from, head: to },
    })
    const spec = formatSpec(state, op)
    if (!spec) return null
    const next = state.update(spec).state
    const sel = next.selection.main
    return {
      doc: next.doc.toString(),
      selected: next.sliceDoc(sel.from, sel.to),
    }
  }

  it("toggles bold on and off, keeping the text selected", () => {
    const on = apply("hello world", 6, 11, { type: "bold", toggle: true })!
    expect(on).toEqual({ doc: "hello **world**", selected: "world" })
    const off = apply(on.doc, 8, 13, { type: "bold", toggle: true })!
    expect(off).toEqual({ doc: "hello world", selected: "world" })
  })

  it("formats each line of a multi-line selection", () => {
    const result = apply("one\ntwo\nthree", 0, 13, {
      type: "italic",
      toggle: true,
    })!
    expect(result.doc).toBe("*one*\n*two*\n*three*")
  })

  it("is all-or-nothing: partly bold selections become fully bold", () => {
    const result = apply("**a** b", 0, 7, { type: "bold", toggle: true })!
    expect(result.doc).toBe("**a b**")
  })

  it("opens an empty pair when nothing is selected", () => {
    const state = EditorState.create({ doc: "x", selection: { anchor: 1 } })
    const next = state.update(
      formatSpec(state, { type: "bold", toggle: true })!
    ).state
    expect(next.doc.toString()).toBe("x****")
    expect(next.selection.main.head).toBe(3)
  })
})
