'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DataTablePaginationProps {
  page: number
  totalPages: number
  total: number
  limit: number
  onPageChange: (page: number) => void
  onLimitChange?: (limit: number) => void
  /** Word used to describe a single row, e.g. "parts", "sales". */
  itemLabel?: string
  /** Whether to show the page-size selector. Defaults to true. */
  showLimitSelector?: boolean
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200]

/**
 * DataTablePagination
 * A compact, accessible pagination bar for any list view. Shows:
 *   - "Showing X–Y of Z items" label
 *   - First / Prev / page numbers / Next / Last buttons
 *   - Page-size selector (optional)
 *
 * Designed for the standard API response shape `{ data, total, page, limit }`.
 */
export function DataTablePagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  itemLabel = 'items',
  showLimitSelector = true,
}: DataTablePaginationProps) {
  // Don't render if there's nothing to paginate
  if (total === 0) return null

  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  const safeTotalPages = Math.max(1, totalPages)
  const safePage = Math.min(Math.max(1, page), safeTotalPages)

  // Show up to 5 page numbers around the current page
  const pageNumbers: number[] = []
  const startPage = Math.max(1, safePage - 2)
  const endPage = Math.min(safeTotalPages, startPage + 4)
  for (let i = startPage; i <= endPage; i++) pageNumbers.push(i)

  const canPrev = safePage > 1
  const canNext = safePage < safeTotalPages

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 px-1">
      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
        <span>
          Showing <strong className="text-foreground">{from.toLocaleString()}</strong>–
          <strong className="text-foreground">{to.toLocaleString()}</strong> of{' '}
          <strong className="text-foreground">{total.toLocaleString()}</strong> {itemLabel}
        </span>
        {showLimitSelector && onLimitChange && (
          <span className="flex items-center gap-1.5">
            <span className="sr-only">Items per page</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => onLimitChange(parseInt(v, 10))}
            >
              <SelectTrigger className="h-7 w-[80px] text-xs" aria-label="Items per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">
                    {n} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPageChange(1)}
          disabled={!canPrev}
          aria-label="First page"
          title="First page"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPageChange(safePage - 1)}
          disabled={!canPrev}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        {startPage > 1 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onPageChange(1)}
            >
              1
            </Button>
            {startPage > 2 && (
              <span className="px-1 text-muted-foreground text-xs">…</span>
            )}
          </>
        )}

        {pageNumbers.map((p) => (
          <Button
            key={p}
            variant={p === safePage ? 'default' : 'ghost'}
            size="sm"
            className={`h-7 px-2.5 text-xs ${p === safePage ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
            onClick={() => onPageChange(p)}
            aria-current={p === safePage ? 'page' : undefined}
          >
            {p}
          </Button>
        ))}

        {endPage < safeTotalPages && (
          <>
            {endPage < safeTotalPages - 1 && (
              <span className="px-1 text-muted-foreground text-xs">…</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onPageChange(safeTotalPages)}
            >
              {safeTotalPages}
            </Button>
          </>
        )}

        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPageChange(safePage + 1)}
          disabled={!canNext}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={!canNext}
          aria-label="Last page"
          title="Last page"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
