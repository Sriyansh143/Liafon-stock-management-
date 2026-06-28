'use client'

/**
 * PageHeader — professional section header with eyebrow + title + description + actions.
 * Inspired by Odoo kanban/form section headers + ERPNext card headers.
 *
 * Usage:
 *   <PageHeader eyebrow="Inventory" title="Stock Transfers" description="Move stock between shops">
 *     <Button>New Transfer</Button>
 *   </PageHeader>
 */

import React from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-1">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-bold tracking-tight text-foreground truncate">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
