import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/auth/current-user"

import { LoginForm } from "./login-form"

export const dynamic = "force-dynamic"

export const metadata = { title: "Log in" }

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/")
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <LoginForm />
    </main>
  )
}
