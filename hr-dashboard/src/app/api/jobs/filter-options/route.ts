import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const JOB_FILTER_FIELDS = [
  "department",
  "employeeType",
  "location",
  "recruiterOwner",
  "functionalPriority",
  "corporatePriority",
  "function",
  "level",
  "horizon",
  "asset",
] as const

export type JobFilterField = (typeof JOB_FILTER_FIELDS)[number]

export const JOB_FILTER_MISSING_VALUE = "__MISSING__" as const

export type JobFilterOption = {
  value: string
  label: string
  isMissing: boolean
}

export type JobsFilterOptionsResponse = {
  missingValue: typeof JOB_FILTER_MISSING_VALUE
  options: Record<JobFilterField, JobFilterOption[]>
}

function buildFilterOptions(values: Array<string | null>): JobFilterOption[] {
  const options: JobFilterOption[] = []
  let hasMissingValue = false

  for (const value of values) {
    if (value === null || value.trim() === "") {
      hasMissingValue = true
      continue
    }

    options.push({
      value,
      label: value,
      isMissing: false,
    })
  }

  options.sort((left, right) =>
    left.label.localeCompare(right.label, undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  )

  if (hasMissingValue) {
    options.push({
      value: JOB_FILTER_MISSING_VALUE,
      label: "Missing",
      isMissing: true,
    })
  }

  return options
}

async function loadDistinctFieldValues(
  field: JobFilterField,
): Promise<Array<string | null>> {
  switch (field) {
    case "department":
      return (
        await prisma.job.findMany({
          distinct: ["department"],
          select: { department: true },
        })
      ).map((row) => row.department)
    case "employeeType":
      return (
        await prisma.job.findMany({
          distinct: ["employeeType"],
          select: { employeeType: true },
        })
      ).map((row) => row.employeeType)
    case "location":
      return (
        await prisma.job.findMany({
          distinct: ["location"],
          select: { location: true },
        })
      ).map((row) => row.location)
    case "recruiterOwner":
      return (
        await prisma.job.findMany({
          distinct: ["recruiterOwner"],
          select: { recruiterOwner: true },
        })
      ).map((row) => row.recruiterOwner)
    case "functionalPriority":
      return (
        await prisma.job.findMany({
          distinct: ["functionalPriority"],
          select: { functionalPriority: true },
        })
      ).map((row) => row.functionalPriority)
    case "corporatePriority":
      return (
        await prisma.job.findMany({
          distinct: ["corporatePriority"],
          select: { corporatePriority: true },
        })
      ).map((row) => row.corporatePriority)
    case "function":
      return (
        await prisma.job.findMany({
          distinct: ["function"],
          select: { function: true },
        })
      ).map((row) => row.function)
    case "level":
      return (
        await prisma.job.findMany({
          distinct: ["level"],
          select: { level: true },
        })
      ).map((row) => row.level)
    case "horizon":
      return (
        await prisma.job.findMany({
          distinct: ["horizon"],
          select: { horizon: true },
        })
      ).map((row) => row.horizon)
    case "asset":
      return (
        await prisma.job.findMany({
          distinct: ["asset"],
          select: { asset: true },
        })
      ).map((row) => row.asset)
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const optionsEntries = await Promise.all(
    JOB_FILTER_FIELDS.map(async (field) => {
      const values = await loadDistinctFieldValues(field)
      return [field, buildFilterOptions(values)] as const
    }),
  )

  return NextResponse.json<JobsFilterOptionsResponse>({
    missingValue: JOB_FILTER_MISSING_VALUE,
    options: Object.fromEntries(optionsEntries) as JobsFilterOptionsResponse["options"],
  })
}
