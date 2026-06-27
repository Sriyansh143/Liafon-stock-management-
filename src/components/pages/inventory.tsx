'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  PackageMinus,
  Trash2,
  AlertTriangle,
  Warehouse,
  Filter,
  Download,
  History,
  X,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/use-fetch';
import { useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { getFieldPermissions } from '@/lib/permissions';
import { formatCurrency } from '@/lib/currency';
import { buildCSV, downloadCSV } from '@/lib/print';

// ─── Types ────────────────────────────────────────────────────────────────

interface SparePart {
  id: string;
  partNumber: string;
  name: string;
  category: string;
  brand: string;
  vehicleModel: string;
  description: string;
  costPrice: number;
  sellingPrice: number;
  currentStock: number;
  minStockLevel: number;
  location: string;
  isActive: boolean;
  currency?: string;
  barcode?: string;
  createdAt: string;
  updatedAt: string;
}

interface PartsResponse {
  parts: SparePart[];
  total: number;
  page: number;
  limit: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Engine',
  'Brakes',
  'Electrical',
  'Suspension',
  'Filters',
  'Body Parts',
  'Transmission',
  'Cooling',
  'Exhaust',
  'Steering',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  Engine: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  Brakes: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  Electrical: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  Suspension: 'bg-slate-100 text-slate-800 dark:bg-slate-700/40 dark:text-slate-300',
  Filters: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Body Parts': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  Transmission: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  Cooling: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  Exhaust: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-700/40 dark:text-zinc-300',
  Steering: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
};

// ─── Zod Schemas ──────────────────────────────────────────────────────────

const partFormSchema = z.object({
  partNumber: z.string().min(1, 'Part number is required'),
  name: z.string().min(1, 'Name is required'),
  category: z.string().min(1, 'Category is required'),
  brand: z.string().min(1, 'Brand is required'),
  vehicleModel: z.string().optional().default(''),
  description: z.string().optional().default(''),
  costPrice: z.coerce.number().min(0, 'Must be 0 or greater'),
  sellingPrice: z.coerce.number().min(0, 'Must be 0 or greater'),
  initialStock: z.coerce.number().int().min(0, 'Must be 0 or greater').optional().default(0),
  minStockLevel: z.coerce.number().int().min(0, 'Must be 0 or greater').optional().default(5),
  location: z.string().optional().default(''),
});

const stockAdjustSchema = z.object({
  newStock: z.coerce.number().int().min(0, 'Stock must be 0 or greater'),
  notes: z.string().optional().default(''),
});

// Use z.output (the post-parse shape with defaults applied) so that
// react-hook-form's expected TFieldValues matches the resolver output.
type PartFormData = z.output<typeof partFormSchema>;
type StockAdjustData = z.output<typeof stockAdjustSchema>;

// ─── Helper ───────────────────────────────────────────────────────────────

function getStockStatus(
  current: number,
  min: number
): 'ok' | 'warning' | 'critical' {
  if (current <= min) return 'critical';
  if (current <= min * 2) return 'warning';
  return 'ok';
}

function getStockColor(status: 'ok' | 'warning' | 'critical') {
  switch (status) {
    case 'ok':
      return 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30';
    case 'warning':
      return 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30';
    case 'critical':
      return 'text-rose-700 bg-rose-100 dark:text-rose-400 dark:bg-rose-900/30';
  }
}

function getProgressColor(status: 'ok' | 'warning' | 'critical') {
  switch (status) {
    case 'ok':
      return 'bg-emerald-500';
    case 'warning':
      return 'bg-amber-500';
    case 'critical':
      return 'bg-rose-500';
  }
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-20 shrink-0" />
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-20 shrink-0" />
          <Skeleton className="h-10 w-20 shrink-0" />
          <Skeleton className="h-10 w-16 shrink-0" />
          <Skeleton className="h-10 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <div className="flex justify-between pt-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function Inventory() {
  const { toast } = useToast();
  const currency = useAppStore((s) => s.currency);
  const currentUser = useAppStore((s) => s.currentUser);
  const perms = getFieldPermissions(currentUser?.role);

  // State
  const [parts, setParts] = useState<SparePart[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [lowStock, setLowStock] = useState(false);

  // Debounce search to avoid one network request per keystroke
  const debouncedSearch = useDebounce(search, 300);
  // Track the in-flight fetch so we can abort it on the next change
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Dialogs
  const [partDialogOpen, setPartDialogOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<SparePart | null>(null);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [adjustingPart, setAdjustingPart] = useState<SparePart | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingPart, setDeletingPart] = useState<SparePart | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Inventory Snapshot (date-range view) ──────────────────────────────
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotPreset, setSnapshotPreset] = useState<'current' | 'week' | 'month' | 'custom'>('current');
  const [snapshotStartDate, setSnapshotStartDate] = useState('');
  const [snapshotEndDate, setSnapshotEndDate] = useState('');
  const [snapshotData, setSnapshotData] = useState<{
    parts: Array<SparePart & { snapshotStock: number; stockChange: number }>;
    summary: { totalParts: number; totalUnits: number; costValue: number; retailValue: number; potentialProfit: number };
    snapshotDate: string;
    preset: string;
  } | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // ─── Part Form ────────────────────────────────────────────────────────
  //
  // NOTE: @hookform/resolvers v5 + zod v4 have a type mismatch between
  // the resolver's input type (with optional fields before parse) and
  // the form's value type (with defaults applied). We cast the resolver
  // to the expected type to work around this; the runtime behavior is
  // unchanged. (See: https://github.com/react-hook-form/resolvers/issues/)
  const partForm = useForm<PartFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(partFormSchema) as any,
    defaultValues: {
      partNumber: '',
      name: '',
      category: '',
      brand: '',
      vehicleModel: '',
      description: '',
      costPrice: 0,
      sellingPrice: 0,
      initialStock: 0,
      minStockLevel: 5,
      location: '',
    },
  });

  const isEditing = editingPart !== null;

  // ─── Stock Form ───────────────────────────────────────────────────────

  const stockForm = useForm<StockAdjustData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(stockAdjustSchema) as any,
    defaultValues: {
      newStock: 0,
      notes: '',
    },
  });

  // ─── Fetch Parts ──────────────────────────────────────────────────────

  const fetchParts = useCallback(async () => {
    // Abort the previous in-flight request so stale responses can't
    // overwrite newer ones.
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (category !== 'all') params.set('category', category);
      if (lowStock) params.set('lowStock', 'true');
      params.set('page', '1');
      params.set('limit', '50');

      const res = await fetch(`/api/parts?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error('Failed to fetch parts');
      const data: PartsResponse = await res.json();
      // Ignore the response if a newer fetch has started
      if (controller.signal.aborted) return;
      setParts(data.parts);
      setTotal(data.total);
    } catch (err) {
      // AbortError is expected when a newer fetch supersedes this one
      if (err instanceof Error && err.name === 'AbortError') return;
      toast({
        title: 'Error',
        description: 'Failed to load parts. Please try again.',
        variant: 'destructive',
      });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [debouncedSearch, category, lowStock, toast]);

  useEffect(() => {
    fetchParts();
    // Abort any in-flight fetch on unmount
    return () => {
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
    };
  }, [fetchParts]);

  // Listen for the global "liafon:inventory:add" event (triggered by the
  // command palette) to open the Add Part dialog from anywhere.
  useEffect(() => {
    const onAdd = () => handleOpenAddDialog();
    window.addEventListener('liafon:inventory:add', onAdd);
    return () => window.removeEventListener('liafon:inventory:add', onAdd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcut: press "n" to open the Add Part dialog when not
  // focused on an input field. Also skip if the user is interacting
  // with a button/link/select (so pressing 'n' on a focused button
  // doesn't yank focus to a new dialog), and require focus to be on
  // document.body (so we don't intercept 'n' while a select popup is open).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // isContentEditable catches rich-text editors
      if (target.isContentEditable) return
      // Only fire when focus is on document.body — pressing 'n' while
      // a button is focused could otherwise surprise the user.
      if (target !== document.body && tag !== 'BODY') return
      if (e.key.toLowerCase() === 'n' && !partDialogOpen && !stockDialogOpen && !deleteDialogOpen) {
        e.preventDefault()
        handleOpenAddDialog()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partDialogOpen, stockDialogOpen, deleteDialogOpen]);

  // ─── Create / Update Part ─────────────────────────────────────────────

  const handleOpenAddDialog = () => {
    setEditingPart(null);
    partForm.reset({
      partNumber: '',
      name: '',
      category: '',
      brand: '',
      vehicleModel: '',
      description: '',
      costPrice: 0,
      sellingPrice: 0,
      initialStock: 0,
      minStockLevel: 5,
      location: '',
    });
    setPartDialogOpen(true);
  };

  const handleOpenEditDialog = (part: SparePart) => {
    setEditingPart(part);
    partForm.reset({
      partNumber: part.partNumber,
      name: part.name,
      category: part.category,
      brand: part.brand,
      vehicleModel: part.vehicleModel,
      description: part.description,
      costPrice: part.costPrice,
      sellingPrice: part.sellingPrice,
      initialStock: 0,
      minStockLevel: part.minStockLevel,
      location: part.location,
    });
    setPartDialogOpen(true);
  };

  const onSubmitPart = async (data: PartFormData) => {
    setSubmitting(true);
    try {
      if (isEditing) {
        const { initialStock, ...updateData } = data;
        const res = await fetch(`/api/parts/${editingPart!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });
        if (!res.ok) throw new Error('Failed to update part');
        toast({
          title: 'Part Updated',
          description: `${data.name} has been updated successfully.`,
        });
      } else {
        const res = await fetch('/api/parts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create part');
        toast({
          title: 'Part Added',
          description: `${data.name} has been added to inventory.`,
        });
      }
      setPartDialogOpen(false);
      fetchParts();
    } catch {
      toast({
        title: isEditing ? 'Update Failed' : 'Create Failed',
        description: isEditing
          ? 'Could not update the part. Please try again.'
          : 'Could not add the part. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Stock Adjustment ─────────────────────────────────────────────────

  const handleOpenStockDialog = (part: SparePart) => {
    setAdjustingPart(part);
    stockForm.reset({ newStock: part.currentStock, notes: '' });
    setStockDialogOpen(true);
  };

  const onSubmitStock = async (data: StockAdjustData) => {
    if (!adjustingPart) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partId: adjustingPart.id,
          newStock: data.newStock,
          notes: data.notes,
        }),
      });
      if (!res.ok) throw new Error('Failed to adjust stock');
      toast({
        title: 'Stock Adjusted',
        description: `Stock for ${adjustingPart.name} updated to ${data.newStock}.`,
      });
      setStockDialogOpen(false);
      fetchParts();
    } catch {
      toast({
        title: 'Adjustment Failed',
        description: 'Could not adjust stock. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Delete Part ──────────────────────────────────────────────────────

  const handleOpenDeleteDialog = (part: SparePart) => {
    setDeletingPart(part);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingPart) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/parts/${deletingPart.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete part');
      toast({
        title: 'Part Deleted',
        description: `${deletingPart.name} has been removed.`,
      });
      setDeleteDialogOpen(false);
      setDeletingPart(null);
      fetchParts();
    } catch {
      toast({
        title: 'Delete Failed',
        description: 'Could not delete the part. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Computed ─────────────────────────────────────────────────────────

  const lowStockCount = useMemo(
    () => parts.filter((p) => p.currentStock <= p.minStockLevel).length,
    [parts]
  );

  // ── Fetch inventory snapshot ──────────────────────────────────────────
  const fetchSnapshot = useCallback(async () => {
    // Don't fetch for custom preset until at least start date is picked
    if (snapshotPreset === 'custom' && !snapshotStartDate) return;
    setSnapshotLoading(true);
    try {
      const params = new URLSearchParams({ preset: snapshotPreset });
      if (snapshotPreset === 'custom' && snapshotStartDate) {
        params.set('startDate', snapshotStartDate);
        if (snapshotEndDate) {
          params.set('endDate', snapshotEndDate);
        }
      }
      const res = await fetch(`/api/inventory-snapshot?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch snapshot');
      const data = await res.json();
      setSnapshotData(data);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load inventory snapshot.',
        variant: 'destructive',
      });
    } finally {
      setSnapshotLoading(false);
    }
  }, [snapshotPreset, snapshotStartDate, snapshotEndDate, toast]);

  // ── Auto-refresh snapshot when preset or dates change ─────────────────
  useEffect(() => {
    if (snapshotOpen) {
      fetchSnapshot();
    }
  }, [snapshotOpen, snapshotPreset, snapshotStartDate, snapshotEndDate, fetchSnapshot]);

  // ─── Export to CSV ────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    if (parts.length === 0) {
      toast({
        title: 'Nothing to export',
        description: 'There are no parts matching the current filters.',
        variant: 'destructive',
      });
      return;
    }
    const rows = parts.map((p) => ({
      PartNumber: p.partNumber,
      Name: p.name,
      Category: p.category,
      Brand: p.brand,
      VehicleModel: p.vehicleModel,
      CostPrice: p.costPrice,
      SellingPrice: p.sellingPrice,
      CurrentStock: p.currentStock,
      MinStockLevel: p.minStockLevel,
      Location: p.location,
      Description: p.description,
      Currency: p.currency,
      Status: p.currentStock <= p.minStockLevel ? 'LOW' : (p.currentStock <= p.minStockLevel * 2 ? 'WARN' : 'OK'),
    }));
    const csv = buildCSV(rows);
    const filename = `inventory_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(filename, csv);
    toast({
      title: 'Export ready',
      description: `${rows.length} parts exported to ${filename}`,
    });
  }, [parts, toast]);

  // ─── Stock Progress Bar Component ─────────────────────────────────────

  const StockBar = ({ current, min }: { current: number; min: number }) => {
    const status = getStockStatus(current, min);
    const maxRef = Math.max(min * 3, current, 1);
    const pct = Math.min((current / maxRef) * 100, 100);

    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${getStockColor(status)}`}
          >
            {current}
          </span>
          {current <= min && (
            <AlertTriangle className="size-3.5 text-rose-500 shrink-0" />
          )}
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${getProgressColor(status)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground">min: {min}</span>
      </div>
    );
  };

  // ─── Mobile Card View ─────────────────────────────────────────────────

  const MobileCard = ({ part }: { part: SparePart }) => {
    const status = getStockStatus(part.currentStock, part.minStockLevel);

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        layout
      >
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0">
                    {part.partNumber}
                  </span>
                  <Badge
                    variant="secondary"
                    className={CATEGORY_COLORS[part.category] || ''}
                  >
                    {part.category}
                  </Badge>
                </div>
                <h3 className="font-semibold text-sm truncate">{part.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {part.brand} {part.vehicleModel ? `· ${part.vehicleModel}` : ''}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 size-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleOpenEditDialog(part)}>
                    <Pencil className="size-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleOpenStockDialog(part)}>
                    <PackageMinus className="size-4" />
                    Adjust Stock
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => handleOpenDeleteDialog(part)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Separator className="my-3" />

            <div className={`grid ${perms.canSeeCostPrice ? 'grid-cols-3' : 'grid-cols-2'} gap-3 text-center`}>
              {perms.canSeeCostPrice && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Cost
                </p>
                <p className="text-sm font-medium">{formatCurrency(part.costPrice, currency, part.currency || 'INR')}</p>
              </div>
              )}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Sell
                </p>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(part.sellingPrice, currency, part.currency || 'INR')}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Stock
                </p>
                <div className="flex justify-center">
                  <StockBar current={part.currentStock} min={part.minStockLevel} />
                </div>
              </div>
            </div>

            {part.location && (
              <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                <Warehouse className="size-3" />
                {part.location}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Top Bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-0 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search parts, brands, models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Category Filter */}
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Low Stock Toggle */}
        <Button
          variant={lowStock ? 'default' : 'outline'}
          size="default"
          onClick={() => setLowStock(!lowStock)}
          className={
            lowStock
              ? 'bg-amber-600 hover:bg-amber-700 text-white'
              : 'text-slate-700 dark:text-slate-300'
          }
        >
          <AlertTriangle className="size-4 mr-1.5" />
          Low Stock
          {lowStockCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-1.5 bg-white/20 text-white border-transparent text-[10px] px-1.5 py-0"
            >
              {lowStockCount}
            </Badge>
          )}
        </Button>

        {/* Add Part */}
        <Button
          onClick={handleOpenAddDialog}
          className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
        >
          <Plus className="size-4 mr-1.5" />
          Add Part
        </Button>

        {/* Export CSV */}
        <Button
          variant="outline"
          size="default"
          onClick={handleExportCSV}
          disabled={parts.length === 0}
          className="w-full sm:w-auto cursor-pointer"
        >
          <Download className="size-4 mr-1.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>

        {/* Inventory Snapshot / History */}
        <Button
          variant="outline"
          size="default"
          onClick={() => setSnapshotOpen(true)}
          className="w-full sm:w-auto cursor-pointer"
        >
          <History className="size-4 mr-1.5" />
          <span className="hidden sm:inline">Snapshot</span>
        </Button>
      </div>

      {/* ── Parts Table (Desktop) ────────────────────────────────────── */}
      {loading ? (
        <CardSkeleton />
      ) : parts.length === 0 ? (
        /* ── Empty State ──────────────────────────────────────────────── */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-4 mb-4">
                <Filter className="size-8 text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                No parts found
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                {search || category !== 'all' || lowStock
                  ? 'Try adjusting your search or filters to find what you\'re looking for.'
                  : 'Get started by adding your first spare part to the inventory.'}
              </p>
              {!search && category === 'all' && !lowStock && (
                <Button
                  onClick={handleOpenAddDialog}
                  className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="size-4 mr-1.5" />
                  Add Your First Part
                </Button>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* Desktop: Table */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead className="w-[120px]">Part #</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[110px]">Category</TableHead>
                      <TableHead className="w-[100px]">Brand</TableHead>
                      <TableHead className="w-[110px]">Vehicle</TableHead>
                      {perms.canSeeCostPrice && (
                        <TableHead className="w-[90px] text-right">Cost</TableHead>
                      )}
                      <TableHead className="w-[90px] text-right">Sell Price</TableHead>
                      <TableHead className="w-[160px]">Stock</TableHead>
                      <TableHead className="w-[60px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {parts.map((part, index) => {
                        const status = getStockStatus(
                          part.currentStock,
                          part.minStockLevel
                        );
                        return (
                          <motion.tr
                            key={part.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2, delay: index * 0.03 }}
                            className="hover:bg-muted/50 border-b transition-colors"
                          >
                            <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                              {part.partNumber}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{part.name}</p>
                                {part.description && (
                                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    {part.description}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={
                                  CATEGORY_COLORS[part.category] || ''
                                }
                              >
                                {part.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {part.brand}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {part.vehicleModel || '—'}
                            </TableCell>
                            {perms.canSeeCostPrice && (
                              <TableCell className="text-right text-sm">
                                {formatCurrency(part.costPrice, currency, part.currency || 'INR')}
                              </TableCell>
                            )}
                            <TableCell className="text-right text-sm font-medium text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(part.sellingPrice, currency, part.currency || 'INR')}
                            </TableCell>
                            <TableCell>
                              <StockBar
                                current={part.currentStock}
                                min={part.minStockLevel}
                              />
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                  >
                                    <MoreHorizontal className="size-4" />
                                    <span className="sr-only">Actions</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleOpenEditDialog(part)}
                                  >
                                    <Pencil className="size-4" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleOpenStockDialog(part)}
                                  >
                                    <PackageMinus className="size-4" />
                                    Adjust Stock
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => handleOpenDeleteDialog(part)}
                                  >
                                    <Trash2 className="size-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </CardContent>
              <div className="px-4 py-3 border-t bg-slate-50/50 dark:bg-slate-800/30">
                <p className="text-sm text-muted-foreground">
                  Showing{' '}
                  <span className="font-medium text-foreground">{parts.length}</span>{' '}
                  of{' '}
                  <span className="font-medium text-foreground">{total}</span>{' '}
                  parts
                </p>
              </div>
            </Card>
          </div>

          {/* Mobile: Cards */}
          <div className="md:hidden space-y-3">
            <AnimatePresence mode="popLayout">
              {parts.map((part) => (
                <MobileCard key={part.id} part={part} />
              ))}
            </AnimatePresence>
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground">
                Showing {parts.length} of {total} parts
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── Add / Edit Part Dialog ─────────────────────────────────────── */}
      <Dialog open={partDialogOpen} onOpenChange={setPartDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-slate-100">
              {isEditing ? 'Edit Part' : 'Add New Part'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the spare part details below.'
                : 'Fill in the details to add a new spare part to inventory.'}
            </DialogDescription>
          </DialogHeader>

          <Form {...partForm}>
            <form
              onSubmit={partForm.handleSubmit(onSubmitPart)}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Part Number */}
                <FormField
                  control={partForm.control}
                  name="partNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Part Number <span className="text-rose-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. BRK-001"
                          {...field}
                          className="font-mono"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Name */}
                <FormField
                  control={partForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Name <span className="text-rose-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Front Brake Pad Set" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Category */}
                <FormField
                  control={partForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Category <span className="text-rose-500">*</span>
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Brand */}
                <FormField
                  control={partForm.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Brand <span className="text-rose-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Bosch" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Vehicle Model */}
                <FormField
                  control={partForm.control}
                  name="vehicleModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Model</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Toyota Camry 2020"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Location */}
                <FormField
                  control={partForm.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Shelf A3, Bay 7"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Cost Price */}
                <FormField
                  control={partForm.control}
                  name="costPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Price</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Selling Price */}
                <FormField
                  control={partForm.control}
                  name="sellingPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Selling Price</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Initial Stock (only for add) */}
                {!isEditing && (
                  <FormField
                    control={partForm.control}
                    name="initialStock"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Initial Stock</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" min="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Min Stock Level */}
                <FormField
                  control={partForm.control}
                  name="minStockLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min Stock Level</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Description (full width) */}
              <FormField
                control={partForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional description of the part..."
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPartDialogOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {submitting
                    ? isEditing
                      ? 'Saving...'
                      : 'Adding...'
                    : isEditing
                      ? 'Save Changes'
                      : 'Add Part'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ── Stock Adjustment Dialog ────────────────────────────────────── */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-slate-100">
              Adjust Stock
            </DialogTitle>
            <DialogDescription>
              Update the stock level for this part.
            </DialogDescription>
          </DialogHeader>

          {adjustingPart && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1">
                <p className="font-semibold text-sm">{adjustingPart.name}</p>
                <p className="text-xs text-muted-foreground">
                  Part #{adjustingPart.partNumber} · {adjustingPart.brand}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">
                    Current Stock:
                  </span>
                  <span className="font-semibold text-sm">
                    {adjustingPart.currentStock}
                  </span>
                  {adjustingPart.currentStock <= adjustingPart.minStockLevel && (
                    <Badge
                      variant="secondary"
                      className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                    >
                      <AlertTriangle className="size-3 mr-1" />
                      Low
                    </Badge>
                  )}
                </div>
              </div>

              <Form {...stockForm}>
                <form
                  onSubmit={stockForm.handleSubmit(onSubmitStock)}
                  className="space-y-4"
                >
                  <FormField
                    control={stockForm.control}
                    name="newStock"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Stock Quantity</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" min="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={stockForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Reason for adjustment..."
                            className="resize-none"
                            rows={2}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStockDialogOpen(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {submitting ? 'Updating...' : 'Update Stock'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ─────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900 dark:text-slate-100">
              Delete Part
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">
                {deletingPart?.name}
              </span>
              ? This action can be undone later, but the part will be hidden
              from inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-600"
            >
              {submitting ? 'Deleting...' : 'Delete Part'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Inventory Snapshot Dialog ─────────────────────────────────── */}
      {snapshotOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setSnapshotOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                <h3 className="text-base font-semibold text-foreground">
                  Inventory Snapshot
                </h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSnapshotOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Preset selector */}
            <div className="px-6 py-3 border-b border-border bg-muted/30">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground mr-1">View:</span>
                {(['current', 'week', 'month', 'custom'] as const).map((p) => (
                  <Button
                    key={p}
                    variant={snapshotPreset === p ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setSnapshotPreset(p);
                      setSnapshotData(null);
                    }}
                    className="text-xs h-7"
                  >
                    {p === 'current' ? 'Current' : p === 'week' ? 'Last 7 days' : p === 'month' ? 'Last 30 days' : 'Custom Range'}
                  </Button>
                ))}
                {snapshotPreset === 'custom' && (
                  <>
                    <Input
                      type="date"
                      value={snapshotStartDate}
                      onChange={(e) => {
                        setSnapshotStartDate(e.target.value);
                        setSnapshotData(null);
                      }}
                      className="h-7 w-auto text-xs"
                      aria-label="Start date"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="date"
                      value={snapshotEndDate}
                      onChange={(e) => {
                        setSnapshotEndDate(e.target.value);
                        setSnapshotData(null);
                      }}
                      className="h-7 w-auto text-xs"
                      aria-label="End date"
                    />
                  </>
                )}
                <Button
                  size="sm"
                  onClick={fetchSnapshot}
                  disabled={snapshotLoading || (snapshotPreset === 'custom' && !snapshotStartDate)}
                  className="text-xs h-7 ml-auto"
                >
                  {snapshotLoading ? 'Loading…' : 'Refresh'}
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {snapshotLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-12 bg-muted rounded-md animate-pulse" />
                  ))}
                </div>
              ) : snapshotData ? (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Parts</p>
                      <p className="text-lg font-semibold tabular-nums">{snapshotData.summary.totalParts}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Units</p>
                      <p className="text-lg font-semibold tabular-nums">{snapshotData.summary.totalUnits.toLocaleString()}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost Value</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {formatCurrency(snapshotData.summary.costValue, currency, 'INR')}
                      </p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Retail Value</p>
                      <p className="text-lg font-semibold tabular-nums">
                        {formatCurrency(snapshotData.summary.retailValue, currency, 'INR')}
                      </p>
                    </div>
                  </div>

                  {/* Snapshot date badge */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Snapshot as of:</span>
                    <Badge variant="secondary" className="text-xs">
                      {new Date(snapshotData.snapshotDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Badge>
                    {snapshotData.preset !== 'current' && (
                      <span className="text-muted-foreground">
                        (reconstructed from stock logs)
                      </span>
                    )}
                  </div>

                  {/* Parts table */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2.5 font-medium text-xs text-muted-foreground">Part</th>
                          <th className="text-left p-2.5 font-medium text-xs text-muted-foreground hidden sm:table-cell">Category</th>
                          <th className="text-right p-2.5 font-medium text-xs text-muted-foreground">Snapshot Stock</th>
                          <th className="text-right p-2.5 font-medium text-xs text-muted-foreground">Current Stock</th>
                          <th className="text-right p-2.5 font-medium text-xs text-muted-foreground">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshotData.parts.slice(0, 100).map((p) => (
                          <tr key={p.id} className="border-t border-border">
                            <td className="p-2.5">
                              <div className="font-medium text-xs">{p.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{p.partNumber}</div>
                            </td>
                            <td className="p-2.5 text-xs text-muted-foreground hidden sm:table-cell">{p.category}</td>
                            <td className="p-2.5 text-right font-semibold tabular-nums">{p.snapshotStock}</td>
                            <td className="p-2.5 text-right tabular-nums text-muted-foreground">{p.currentStock}</td>
                            <td className="p-2.5 text-right tabular-nums">
                              {p.stockChange > 0 ? (
                                <span className="text-emerald-600">+{p.stockChange}</span>
                              ) : p.stockChange < 0 ? (
                                <span className="text-rose-600">{p.stockChange}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {snapshotData.parts.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Showing first 100 of {snapshotData.parts.length} parts
                    </p>
                  )}

                  {/* Export snapshot to CSV */}
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5"
                      onClick={() => {
                        const rows = snapshotData.parts.map((p) => ({
                          PartNumber: p.partNumber,
                          Name: p.name,
                          Category: p.category,
                          Brand: p.brand,
                          SnapshotStock: p.snapshotStock,
                          CurrentStock: p.currentStock,
                          Change: p.stockChange,
                          CostPrice: p.costPrice,
                          SellingPrice: p.sellingPrice,
                        }));
                        const csv = buildCSV(rows);
                        const dateStr = new Date(snapshotData.snapshotDate).toISOString().slice(0, 10);
                        downloadCSV(`inventory_snapshot_${snapshotData.preset}_${dateStr}.csv`, csv);
                        toast({ title: 'Snapshot exported', description: `${rows.length} parts` });
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  {snapshotPreset === 'custom' && !snapshotStartDate
                    ? 'Please select a date to view the snapshot.'
                    : 'Click "Refresh" to load the snapshot.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}