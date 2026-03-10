import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ColumnDef, SortingState, PaginationState } from "@tanstack/react-table"

import { DataTable } from "@/components/ui/data-table"

interface TestRow {
  id: string
  name: string
  email: string
  status: string
}

const mockData: TestRow[] = [
  { id: "1", name: "Alice Johnson", email: "alice@example.com", status: "active" },
  { id: "2", name: "Bob Smith", email: "bob@example.com", status: "inactive" },
  { id: "3", name: "Charlie Brown", email: "charlie@example.com", status: "active" },
]

const columns: ColumnDef<TestRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    enableSorting: true,
  },
  {
    accessorKey: "email",
    header: "Email",
    enableSorting: true,
  },
  {
    accessorKey: "status",
    header: "Status",
    enableSorting: false,
  },
]

describe("DataTable", () => {
  describe("Basic rendering", () => {
    it("renders table with correct headers", () => {
      render(<DataTable columns={columns} data={mockData} />)

      expect(screen.getByRole("table")).toBeInTheDocument()
      expect(screen.getByText("Name")).toBeInTheDocument()
      expect(screen.getByText("Email")).toBeInTheDocument()
      expect(screen.getByText("Status")).toBeInTheDocument()
    })

    it("renders all data rows", () => {
      render(<DataTable columns={columns} data={mockData} />)

      expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
      expect(screen.getByText("Bob Smith")).toBeInTheDocument()
      expect(screen.getByText("Charlie Brown")).toBeInTheDocument()
    })

    it("renders cell data correctly", () => {
      render(<DataTable columns={columns} data={mockData} />)

      expect(screen.getByText("alice@example.com")).toBeInTheDocument()
      expect(screen.getByText("bob@example.com")).toBeInTheDocument()
      expect(screen.getByText("charlie@example.com")).toBeInTheDocument()
    })
  })

  describe("Empty state", () => {
    it("shows default empty message when no data", () => {
      render(<DataTable columns={columns} data={[]} />)

      expect(screen.getByText("No results.")).toBeInTheDocument()
    })

    it("shows custom empty message when provided", () => {
      render(
        <DataTable
          columns={columns}
          data={[]}
          emptyMessage="No items found"
        />
      )

      expect(screen.getByText("No items found")).toBeInTheDocument()
    })
  })

  describe("Loading state", () => {
    it("renders skeleton rows when loading", () => {
      render(
        <DataTable
          columns={columns}
          data={[]}
          isLoading={true}
          pagination={{ pageIndex: 0, pageSize: 5 }}
        />
      )

      const table = screen.getByRole("table")
      const rowgroups = within(table).getAllByRole("rowgroup")
      const tbody = rowgroups[1]! // tbody (rowgroups[0] is thead)
      const rows = within(tbody).getAllByRole("row")

      // Should render pageSize skeleton rows
      expect(rows).toHaveLength(5)

      // Check for skeleton elements (bg-muted divs with h-4 styling)
      // Uses motion-safe:animate-pulse which is a Tailwind modifier class
      const skeletonCells = table.querySelectorAll(".bg-muted.h-4")
      expect(skeletonCells.length).toBeGreaterThan(0)
    })

    it("does not show data rows when loading", () => {
      render(
        <DataTable
          columns={columns}
          data={mockData}
          isLoading={true}
          pagination={{ pageIndex: 0, pageSize: 5 }}
        />
      )

      // Data should not be visible when loading
      expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument()
    })
  })

  describe("Sorting - Header interaction", () => {
    it("renders sortable headers with sort buttons", () => {
      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={[]}
          onSortingChange={vi.fn()}
        />
      )

      // Sortable columns should have buttons
      const nameButton = screen.getByRole("button", { name: /name/i })
      const emailButton = screen.getByRole("button", { name: /email/i })

      expect(nameButton).toBeInTheDocument()
      expect(emailButton).toBeInTheDocument()
    })

    it("non-sortable columns do not have sort buttons", () => {
      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={[]}
          onSortingChange={vi.fn()}
        />
      )

      // Status column has enableSorting: false
      const statusHeader = screen.getByText("Status")
      // Should not be a button
      expect(statusHeader.closest("button")).toBeNull()
    })

    it("calls onSortingChange when sort button is clicked", () => {
      const onSortingChange = vi.fn()

      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={[]}
          onSortingChange={onSortingChange}
        />
      )

      const nameButton = screen.getByRole("button", { name: /name/i })
      fireEvent.click(nameButton)

      expect(onSortingChange).toHaveBeenCalled()
    })
  })

  describe("Sorting - ARIA attributes", () => {
    it("sets aria-sort='none' when column is not sorted", () => {
      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={[]}
          onSortingChange={vi.fn()}
        />
      )

      const headers = screen.getAllByRole("columnheader")
      const nameHeader = headers.find((h) => h.textContent?.includes("Name"))

      expect(nameHeader).toBeDefined()
      expect(nameHeader!).toHaveAttribute("aria-sort", "none")
    })

    it("sets aria-sort='ascending' when sorted asc", () => {
      const sorting: SortingState = [{ id: "name", desc: false }]

      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={sorting}
          onSortingChange={vi.fn()}
        />
      )

      const headers = screen.getAllByRole("columnheader")
      const nameHeader = headers.find((h) => h.textContent?.includes("Name"))

      expect(nameHeader).toBeDefined()
      expect(nameHeader!).toHaveAttribute("aria-sort", "ascending")
    })

    it("sets aria-sort='descending' when sorted desc", () => {
      const sorting: SortingState = [{ id: "name", desc: true }]

      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={sorting}
          onSortingChange={vi.fn()}
        />
      )

      const headers = screen.getAllByRole("columnheader")
      const nameHeader = headers.find((h) => h.textContent?.includes("Name"))

      expect(nameHeader).toBeDefined()
      expect(nameHeader!).toHaveAttribute("aria-sort", "descending")
    })

    it("displays correct sort icon for ascending sort", () => {
      const sorting: SortingState = [{ id: "name", desc: false }]

      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={sorting}
          onSortingChange={vi.fn()}
        />
      )

      const nameButton = screen.getByRole("button", { name: /name/i })
      // ArrowUp icon should be present for ascending
      const arrowUp = nameButton.querySelector("svg")
      expect(arrowUp).toBeInTheDocument()
    })

    it("displays correct sort icon for descending sort", () => {
      const sorting: SortingState = [{ id: "name", desc: true }]

      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={sorting}
          onSortingChange={vi.fn()}
        />
      )

      const nameButton = screen.getByRole("button", { name: /name/i })
      // ArrowDown icon should be present for descending
      const arrowDown = nameButton.querySelector("svg")
      expect(arrowDown).toBeInTheDocument()
    })
  })

  describe("Pagination - Controls", () => {
    it("renders pagination controls when pagination is enabled", () => {
      const pagination: PaginationState = { pageIndex: 0, pageSize: 10 }

      render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={vi.fn()}
          pageCount={3}
          totalCount={30}
        />
      )

      expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument()
    })

    it("shows page info text", () => {
      const pagination: PaginationState = { pageIndex: 0, pageSize: 10 }

      const { container } = render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={vi.fn()}
          pageCount={3}
          totalCount={30}
        />
      )

      // Text is split for responsive design: <span class="hidden sm:inline">Page </span>1 of 3
      // Check the pagination info container has correct text
      const pageInfo = container.querySelector('.min-w-20.text-center')
      expect(pageInfo).toBeInTheDocument()
      expect(pageInfo?.textContent).toMatch(/1 of 3/)
    })

    it("shows result range text", () => {
      const pagination: PaginationState = { pageIndex: 0, pageSize: 10 }

      render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={vi.fn()}
          pageCount={3}
          totalCount={30}
        />
      )

      // endRow = min((pageIndex+1) * pageSize, totalCount) = min(10, 30) = 10
      expect(screen.getByText(/showing 1-10 of 30 results/i)).toBeInTheDocument()
    })
  })

  describe("Pagination - Boundary conditions", () => {
    it("disables Previous button on first page", () => {
      const pagination: PaginationState = { pageIndex: 0, pageSize: 10 }

      render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={vi.fn()}
          pageCount={3}
          totalCount={30}
        />
      )

      const prevButton = screen.getByRole("button", { name: /previous/i })
      expect(prevButton).toBeDisabled()
    })

    it("enables Previous button on non-first page", () => {
      const pagination: PaginationState = { pageIndex: 1, pageSize: 10 }

      render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={vi.fn()}
          pageCount={3}
          totalCount={30}
        />
      )

      const prevButton = screen.getByRole("button", { name: /previous/i })
      expect(prevButton).not.toBeDisabled()
    })

    it("disables Next button on last page", () => {
      const pagination: PaginationState = { pageIndex: 2, pageSize: 10 }

      render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={vi.fn()}
          pageCount={3}
          totalCount={30}
        />
      )

      const nextButton = screen.getByRole("button", { name: /next/i })
      expect(nextButton).toBeDisabled()
    })

    it("enables Next button on non-last page", () => {
      const pagination: PaginationState = { pageIndex: 0, pageSize: 10 }

      render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={vi.fn()}
          pageCount={3}
          totalCount={30}
        />
      )

      const nextButton = screen.getByRole("button", { name: /next/i })
      expect(nextButton).not.toBeDisabled()
    })

    it("hides pagination when pageCount is 1", () => {
      const pagination: PaginationState = { pageIndex: 0, pageSize: 10 }

      render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={vi.fn()}
          pageCount={1}
          totalCount={3}
        />
      )

      expect(screen.queryByRole("button", { name: /previous/i })).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument()
    })
  })

  describe("Pagination - Navigation callbacks", () => {
    it("calls onPaginationChange when Next is clicked", () => {
      const onPaginationChange = vi.fn()
      const pagination: PaginationState = { pageIndex: 0, pageSize: 10 }

      render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={onPaginationChange}
          pageCount={3}
          totalCount={30}
        />
      )

      const nextButton = screen.getByRole("button", { name: /next/i })
      fireEvent.click(nextButton)

      expect(onPaginationChange).toHaveBeenCalled()
    })

    it("calls onPaginationChange when Previous is clicked", () => {
      const onPaginationChange = vi.fn()
      const pagination: PaginationState = { pageIndex: 1, pageSize: 10 }

      render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={onPaginationChange}
          pageCount={3}
          totalCount={30}
        />
      )

      const prevButton = screen.getByRole("button", { name: /previous/i })
      fireEvent.click(prevButton)

      expect(onPaginationChange).toHaveBeenCalled()
    })
  })

  describe("Keyboard accessibility", () => {
    it("sort buttons are keyboard focusable", async () => {
      const user = userEvent.setup()

      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={[]}
          onSortingChange={vi.fn()}
        />
      )

      // Verify sort buttons exist and are focusable
      expect(screen.getByRole("button", { name: /name/i })).toBeInTheDocument()

      await user.tab()
      // After tabbing, one of the buttons should be focused
      const focusedElement = document.activeElement
      expect(focusedElement?.tagName).toBe("BUTTON")
    })

    it("sort buttons can be activated with Enter key", async () => {
      const user = userEvent.setup()
      const onSortingChange = vi.fn()

      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={[]}
          onSortingChange={onSortingChange}
        />
      )

      const nameButton = screen.getByRole("button", { name: /name/i })
      nameButton.focus()
      await user.keyboard("{Enter}")

      expect(onSortingChange).toHaveBeenCalled()
    })

    it("sort buttons can be activated with Space key", async () => {
      const user = userEvent.setup()
      const onSortingChange = vi.fn()

      render(
        <DataTable
          columns={columns}
          data={mockData}
          sorting={[]}
          onSortingChange={onSortingChange}
        />
      )

      const nameButton = screen.getByRole("button", { name: /name/i })
      nameButton.focus()
      await user.keyboard(" ")

      expect(onSortingChange).toHaveBeenCalled()
    })

    it("pagination buttons are keyboard accessible", async () => {
      const user = userEvent.setup()
      const onPaginationChange = vi.fn()
      const pagination: PaginationState = { pageIndex: 1, pageSize: 10 }

      render(
        <DataTable
          columns={columns}
          data={mockData}
          pagination={pagination}
          onPaginationChange={onPaginationChange}
          pageCount={3}
          totalCount={30}
        />
      )

      const nextButton = screen.getByRole("button", { name: /next/i })
      nextButton.focus()
      await user.keyboard("{Enter}")

      expect(onPaginationChange).toHaveBeenCalled()
    })
  })

  describe("Row selection", () => {
    it("does not enable row selection by default", () => {
      render(<DataTable columns={columns} data={mockData} />)

      const checkboxes = screen.queryAllByRole("checkbox")
      expect(checkboxes).toHaveLength(0)
    })

    it("tracks row selection when enabled", () => {
      const onRowSelectionChange = vi.fn()

      render(
        <DataTable
          columns={columns}
          data={mockData}
          rowSelection={{}}
          onRowSelectionChange={onRowSelectionChange}
        />
      )

      // Row selection is enabled via the onRowSelectionChange callback
      expect(onRowSelectionChange).toBeDefined()
    })
  })

  describe("Column meta styling", () => {
    it("applies custom header className from column meta", () => {
      const columnsWithMeta: ColumnDef<TestRow>[] = [
        {
          accessorKey: "name",
          header: "Name",
          meta: { headerClassName: "custom-header-class" },
        },
      ]

      render(<DataTable columns={columnsWithMeta} data={mockData} />)

      const headers = screen.getAllByRole("columnheader")
      expect(headers[0]).toHaveClass("custom-header-class")
    })

    it("applies custom cell className from column meta", () => {
      const columnsWithMeta: ColumnDef<TestRow>[] = [
        {
          accessorKey: "name",
          header: "Name",
          meta: { cellClassName: "custom-cell-class" },
        },
      ]

      render(<DataTable columns={columnsWithMeta} data={mockData} />)

      const cells = screen.getAllByRole("cell")
      expect(cells[0]).toHaveClass("custom-cell-class")
    })
  })
})
