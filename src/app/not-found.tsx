import Link from 'next/link'
import { Package, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 space-y-4 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-600/10 flex items-center justify-center">
            <Package className="h-8 w-8 text-emerald-600" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-bold tracking-tight">404</h1>
            <h2 className="text-base font-medium text-muted-foreground">
              Page not found
            </h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
