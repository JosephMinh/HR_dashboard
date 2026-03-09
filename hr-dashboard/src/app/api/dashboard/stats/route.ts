import { NextResponse, type NextRequest } from "next/server"

import { auth } from "@/lib/auth"
import { getDashboardStats } from "@/lib/dashboard"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<Record<string, never>> },
) {
  void request
  void context

  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const stats = await getDashboardStats()
    return NextResponse.json(stats)
  } catch (error) {
    console.error("[dashboard-stats] Failed to load dashboard stats", error)

    return NextResponse.json(
      { error: "Failed to load dashboard stats" },
      { status: 500 },
    )
  }
}
