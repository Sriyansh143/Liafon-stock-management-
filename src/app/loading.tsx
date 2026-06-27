import { Package } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-600/10 flex items-center justify-center">
          <Package className="w-8 h-8 text-emerald-600 animate-pulse" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
        <p className="text-sm text-muted-foreground">
          Loading Liafon Stock Management…
        </p>
      </div>
    </div>
  )
}
