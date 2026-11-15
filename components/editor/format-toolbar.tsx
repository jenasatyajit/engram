"use client"

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  TextBoldIcon,
  TextClearIcon,
  TextColorIcon,
  TextItalicIcon,
} from "@hugeicons/core-free-icons"
import type { EditorView } from "@codemirror/view"

import { Button } from "@/components/ui/button"
import {
  FORMAT_COLORS,
  type Attrs,
  type FormatColor,
} from "@/lib/board/formatting"
import { cn } from "@/lib/utils"

import { runFormat } from "./format-extension"

/*
 * Floating bar shown over a text selection: bold, italic, colours, clear.
 * Mouse presses never take focus from the editor, so the selection stays put.
 */

const TOOLBAR_HEIGHT = 48

export type FormatSelection = {
  from: number
  to: number
  format: Attrs | null
}

export function FormatToolbar({
  viewRef,
  selection,
}: {
  viewRef: RefObject<EditorView | null>
  selection: FormatSelection
}) {
  const [place, setPlace] = useState<{ x: number; top: number } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const format = selection.format

  // Sit above the selection (below it when there is no room); follow scrolling and resizing.
  useLayoutEffect(() => {
    const update = () => {
      const view = viewRef.current
      const start = view?.coordsAtPos(selection.from, 1)
      const end = view?.coordsAtPos(selection.to, -1)
      if (!start || !end) return setPlace(null)
      const sameLine = Math.abs(start.top - end.top) < 4
      const mid = sameLine ? (start.left + end.right) / 2 : start.left + 40
      const half = (bar.current?.offsetWidth ?? 220) / 2
      const x = Math.max(half + 8, Math.min(mid, window.innerWidth - half - 8))
      const above = start.top - TOOLBAR_HEIGHT - 8
      setPlace({ x, top: above >= 8 ? above : end.bottom + 8 })
    }
    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [selection.from, selection.to, viewRef])

  const view = () => viewRef.current
  const apply = (op: Parameters<typeof runFormat>[1]) => {
    const v = view()
    if (v) runFormat(v, op)
  }

  if (!place) return null

  return createPortal(
    <div
      ref={bar}
      data-format-toolbar=""
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={(event) => event.preventDefault()}
      style={{
        position: "fixed",
        left: place.x,
        top: place.top,
        transform: "translateX(-50%)",
      }}
      className="z-50 flex items-center gap-1 rounded-2xl bg-popover p-1.5 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 dark:ring-foreground/10"
    >
      <ToolButton
        label="Bold"
        hint="Ctrl+B"
        pressed={format?.bold ?? false}
        onClick={() => apply({ type: "bold", toggle: true })}
      >
        <HugeiconsIcon icon={TextBoldIcon} strokeWidth={2} />
      </ToolButton>
      <ToolButton
        label="Italic"
        hint="Ctrl+I"
        pressed={format?.italic ?? false}
        onClick={() => apply({ type: "italic", toggle: true })}
      >
        <HugeiconsIcon icon={TextItalicIcon} strokeWidth={2} />
      </ToolButton>

      <ToolButton
        label="Colour"
        hint="Text colour and highlight"
        pressed={paletteOpen}
        expanded={paletteOpen}
        onClick={() => setPaletteOpen((open) => !open)}
      >
        <span className="relative flex flex-col items-center">
          <HugeiconsIcon icon={TextColorIcon} strokeWidth={2} />
          <span
            className="absolute -bottom-1 h-[3px] w-4 rounded-full"
            style={{
              background: format?.color
                ? `var(--fmt-text-${format.color})`
                : format?.highlight
                  ? `var(--fmt-bg-${format.highlight})`
                  : "var(--muted-foreground)",
            }}
          />
        </span>
      </ToolButton>

      <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />

      <ToolButton
        label="Clear formatting"
        onClick={() => {
          apply({ type: "clear", scope: "all" })
          setPaletteOpen(false)
        }}
      >
        <HugeiconsIcon icon={TextClearIcon} strokeWidth={2} />
      </ToolButton>

      {paletteOpen && (
        <Palette
          format={format}
          onPick={(op) => apply(op)}
          onClear={() => apply({ type: "clear", scope: "colors" })}
        />
      )}
    </div>,
    document.body
  )
}

function ToolButton({
  label,
  hint,
  pressed,
  expanded,
  onClick,
  children,
}: {
  label: string
  hint?: string
  pressed?: boolean
  expanded?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      title={hint ? `${label} (${hint})` : label}
      onClick={onClick}
      className={cn("rounded-xl", pressed && "bg-muted text-foreground")}
    >
      {children}
    </Button>
  )
}

function Palette({
  format,
  onPick,
  onClear,
}: {
  format: Attrs | null
  onPick: (
    op:
      | { type: "color"; name: FormatColor | null }
      | { type: "highlight"; name: FormatColor | null }
  ) => void
  onClear: () => void
}) {
  return (
    <div className="absolute top-full left-1/2 mt-2 w-[216px] -translate-x-1/2 rounded-2xl bg-popover p-3 shadow-2xl ring-1 ring-foreground/5 dark:ring-foreground/10">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Text colour
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {FORMAT_COLORS.map((name) => (
          <Swatch
            key={name}
            label={`Text ${name}`}
            selected={format?.color === name}
            onClick={() =>
              onPick({
                type: "color",
                name: format?.color === name ? null : name,
              })
            }
          >
            <span
              className="text-[15px] font-semibold underline decoration-2 underline-offset-2"
              style={{ color: `var(--fmt-text-${name})` }}
            >
              A
            </span>
          </Swatch>
        ))}
      </div>

      <div className="my-3 h-px bg-border/60" />

      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Highlight
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {FORMAT_COLORS.map((name) => (
          <Swatch
            key={name}
            label={`Highlight ${name}`}
            selected={format?.highlight === name}
            background={`var(--fmt-bg-${name})`}
            onClick={() =>
              onPick({
                type: "highlight",
                name: format?.highlight === name ? null : name,
              })
            }
          >
            <span className="text-[15px] font-semibold underline decoration-2 underline-offset-2">
              A
            </span>
          </Swatch>
        ))}
      </div>

      <div className="my-3 h-px bg-border/60" />

      <button
        type="button"
        onClick={onClear}
        className="text-sm font-medium text-primary hover:underline"
      >
        Clear
      </button>
    </div>
  )
}

function Swatch({
  label,
  selected,
  background,
  onClick,
  children,
}: {
  label: string
  selected: boolean
  background?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      style={background ? { background } : undefined}
      className={cn(
        "flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-muted",
        background && "hover:brightness-110",
        selected && "ring-2 ring-foreground/70"
      )}
    >
      {children}
    </button>
  )
}
