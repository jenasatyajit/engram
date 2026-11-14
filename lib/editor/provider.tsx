"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { useStore } from "zustand"

import type { BoardView } from "@/lib/board/repo"

import {
  createEditorStore,
  type EditorStore,
  type EditorStoreApi,
} from "./store"

const EditorStoreContext = createContext<EditorStoreApi | null>(null)

/** One store per open board (Zustand's Next.js pattern: no global store). */
export function EditorStoreProvider({
  initialView,
  children,
}: {
  initialView: BoardView | null
  children: ReactNode
}) {
  const [store] = useState(() => createEditorStore(initialView))
  return (
    <EditorStoreContext.Provider value={store}>
      {children}
    </EditorStoreContext.Provider>
  )
}

export function useEditor<T>(selector: (state: EditorStore) => T): T {
  const store = useContext(EditorStoreContext)
  if (!store)
    throw new Error("useEditor must be used inside EditorStoreProvider")
  return useStore(store, selector)
}

export function useEditorApi() {
  const store = useContext(EditorStoreContext)
  if (!store)
    throw new Error("useEditorApi must be used inside EditorStoreProvider")
  return store
}
