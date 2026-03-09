import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PageHeader } from "@/components/ui/page-header"
import { renderWithSession } from "@/test/render"

describe("PageHeader", () => {
  it("renders title, description, and actions", () => {
    renderWithSession(
      <PageHeader title="Dashboard" description="Recruiting overview">
        <button type="button">New Job</button>
      </PageHeader>,
    )

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Recruiting overview")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "New Job" }),
    ).toBeInTheDocument()
  })
})
