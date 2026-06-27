'use client'

import { Calendar, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DateRangeFilterProps {
  startDate: string
  endDate: string
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  onClear: () => void
  label?: string
}

/**
 * Reusable date range filter component.
 * Used on Dashboard, Sales, Purchases, Reports, and Activity pages.
 *
 * Shows two date inputs (start + end) with a "Clear" button.
 * When both dates are empty, all data is shown (no filter).
 * When dates are set, only data within the range is shown.
 */
export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
  label = 'Date Range',
}: DateRangeFilterProps) {
  const hasFilter = !!(startDate || endDate)

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
          From
        </Label>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="h-8 w-[140px] text-xs"
          aria-label="Start date"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
          To
        </Label>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="h-8 w-[140px] text-xs"
          aria-label="End date"
        />
      </div>
      {hasFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Clear
        </Button>
      )}
    </div>
  )
}
