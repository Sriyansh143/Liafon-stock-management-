'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday, startOfDay, endOfDay } from 'date-fns';
import {
  PackageOpen,
  Search,
  X,
  Package,
  DollarSign,
  Calendar,
  Phone,
  FileText,
  MessageSquare,
  Send,
  Loader2,
  TrendingDown,
  Factory,
  Download,
  Camera,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { useToast } from '@/hooks/use-toast';
import {
  formatPurchaseMessage,
  openWhatsApp,
  type Department,
} from '@/lib/whatsapp';

import { useAppStore } from '@/store/app-store'
import { formatCurrency } from '@/lib/currency'
import { buildCSV, downloadCSV } from '@/lib/print'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SparePart {
  id: string;
  name: string;
  partNumber: string;
  brand: string;
  currentStock: number;
  costPrice: number;
  currency?: string;
  category?: string;
  sellingPrice?: number;
  minStockLevel?: number;
}

interface PurchaseWithPart {
  id: string;
  partId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplierName: string;
  supplierPhone: string;
  notes: string;
  date: string;
  createdAt: string;
  invoiceNumber?: string;
  currency?: string;
  part: {
    id: string;
    name: string;
    partNumber: string;
    brand: string;
    currentStock: number;
    costPrice: number;
    currency?: string;
  };
}

interface PurchasesResponse {
  purchases: PurchaseWithPart[];
  total: number;
  page: number;
  limit: number;
}

interface NewPurchaseForm {
  partId: string;
  quantity: number;
  unitCost: number;
  supplierName: string;
  supplierPhone: string;
  notes: string;
}

// ─── Animation Variants ─────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
};

const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, duration: 0.3, ease: 'easeOut' as const },
  }),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return format(new Date(dateStr), 'MMM d, yyyy');
}

function formatTime(dateStr: string): string {
  return format(new Date(dateStr), 'h:mm a');
}

function getTodayRange() {
  const today = new Date();
  return {
    start: startOfDay(today).toISOString(),
    end: endOfDay(today).toISOString(),
  };
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function PurchasesTableSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-28 ml-auto" />
        </div>
        <Separator />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24 flex-shrink-0" />
              <Skeleton className="h-4 w-32 flex-1" />
              <Skeleton className="h-4 w-16 flex-shrink-0" />
              <Skeleton className="h-4 w-12 flex-shrink-0" />
              <Skeleton className="h-4 w-20 flex-shrink-0" />
              <Skeleton className="h-4 w-20 flex-shrink-0" />
              <Skeleton className="h-8 w-8 flex-shrink-0 rounded" />
            </div>
          ))}
        </div>
        <Separator />
        <div className="flex justify-end">
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
    </Card>
  );
}

function TodayPurchasesCard({
  total,
  count,
}: {
  total: number;
  count: number;
}) {
  const currency = useAppStore((s) => s.currency)
  return (
    <motion.div variants={itemVariants}>
      <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/60 flex-shrink-0">
            <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Today&apos;s Purchases
            </p>
            <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
              {formatCurrency(total, currency, 'INR')}
            </p>
          </div>
          <Badge
            variant="secondary"
            className="ml-auto bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-xs flex-shrink-0"
          >
            {count} {count === 1 ? 'purchase' : 'purchases'}
          </Badge>
        </div>
      </Card>
    </motion.div>
  );
}

// ─── Part Search Combobox ───────────────────────────────────────────────────

function PartSearchCombobox({
  onSelect,
  disabled,
}: {
  onSelect: (part: SparePart) => void;
  disabled: boolean;
}) {
  const currency = useAppStore((s) => s.currency)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SparePart[]>([]);
  const [searching, setSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchParts = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/parts?search=${encodeURIComponent(searchQuery)}&limit=20`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.parts || []);
        setIsOpen(data.parts?.length > 0);
        setHighlightIndex(-1);
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        searchParts(value);
      }, 300);
    },
    [searchParts]
  );

  const handleSelect = useCallback(
    (part: SparePart) => {
      setQuery('');
      setResults([]);
      setIsOpen(false);
      onSelect(part);
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || results.length === 0) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev > 0 ? prev - 1 : results.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightIndex >= 0 && results[highlightIndex]) {
            handleSelect(results[highlightIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, highlightIndex, handleSelect]
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 && query.trim()) setIsOpen(true);
          }}
          placeholder="Search parts by name, part#, or brand..."
          disabled={disabled}
          className="pl-9 pr-9"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsOpen(false);
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        {searching && (
          <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg"
          >
            <ScrollArea className="max-h-56">
              <div className="p-1">
                {results.map((part, idx) => (
                  <button
                    key={part.id}
                    type="button"
                    className={`w-full text-left rounded-md px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                      idx === highlightIndex
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100'
                        : 'hover:bg-accent hover:text-accent-foreground'
                    }`}
                    onClick={() => handleSelect(part)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{part.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono">
                            #{part.partNumber}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {part.brand}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0">
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                          {formatCurrency(part.costPrice, currency, part.currency || 'INR')}
                        </span>
                        <span className="text-xs mt-0.5 text-muted-foreground">
                          Stock: {part.currentStock}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── WhatsApp Share Button ────────────────────────────────────────────────────

function WhatsAppShareButton({
  purchase,
  departments,
}: {
  purchase: PurchaseWithPart;
  departments: Department[];
}) {
  const currency = useAppStore((s) => s.currency)
  const handleShareToDepartment = useCallback(
    (department: Department) => {
      const message = formatPurchaseMessage({
        partName: purchase.part.name,
        partNumber: purchase.part.partNumber,
        quantity: purchase.quantity,
        unitCost: purchase.unitCost,
        totalCost: purchase.totalCost,
        supplierName: purchase.supplierName || 'Unknown',
        date: formatDate(purchase.date),
        currency,
      });
      openWhatsApp(department.phone, message);
    },
    [purchase]
  );

  const handleSendToAll = useCallback(() => {
    const message = formatPurchaseMessage({
      partName: purchase.part.name,
      partNumber: purchase.part.partNumber,
      quantity: purchase.quantity,
      unitCost: purchase.unitCost,
      totalCost: purchase.totalCost,
      supplierName: purchase.supplierName || 'Unknown',
      date: formatDate(purchase.date),
      currency,
    });
    departments.forEach((dept) => {
      setTimeout(() => openWhatsApp(dept.phone, message), 100);
    });
  }, [purchase, departments]);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-950/50"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Share via WhatsApp</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Send to department...
        </div>
        <DropdownMenuSeparator />
        {departments.map((dept) => (
          <DropdownMenuItem
            key={dept.id}
            onClick={() => handleShareToDepartment(dept)}
            className="cursor-pointer"
          >
            <Phone className="h-3.5 w-3.5 mr-2 text-amber-500" />
            <span className="truncate">{dept.name}</span>
          </DropdownMenuItem>
        ))}
        {departments.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSendToAll}
              className="cursor-pointer text-amber-600 dark:text-amber-400"
            >
              <Send className="h-3.5 w-3.5 mr-2" />
              <span>Send to All</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── New Purchase Dialog ─────────────────────────────────────────────────────

function NewPurchaseDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: NewPurchaseForm) => Promise<void>;
}) {
  const currency = useAppStore((s) => s.currency)
  const [selectedPart, setSelectedPart] = useState<SparePart | null>(null);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalCost = unitCost * quantity;

  const handlePartSelect = useCallback((part: SparePart) => {
    setSelectedPart(part);
    setUnitCost(part.costPrice || 0);
    setQuantity(1);
  }, []);

  const resetForm = useCallback(() => {
    setSelectedPart(null);
    setUnitCost(0);
    setQuantity(1);
    setSupplierName('');
    setSupplierPhone('');
    setNotes('');
    setSubmitting(false);
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        resetForm();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetForm]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedPart || quantity <= 0 || unitCost <= 0) return;

      setSubmitting(true);
      try {
        await onSubmit({
          partId: selectedPart.id,
          unitCost,
          quantity,
          supplierName: supplierName.trim(),
          supplierPhone: supplierPhone.trim(),
          notes: notes.trim(),
        });
        resetForm();
      } finally {
        setSubmitting(false);
      }
    },
    [selectedPart, unitCost, quantity, supplierName, supplierPhone, notes, onSubmit, resetForm]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <PackageOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            New Purchase
          </DialogTitle>
          <DialogDescription>
            Search for a part and fill in the purchase details. This will add to
            stock and update the cost price.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Part Search */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              <Package className="h-3.5 w-3.5 mr-1 inline" />
              Select Part
            </Label>
            <PartSearchCombobox
              onSelect={handlePartSelect}
              disabled={submitting}
            />
          </div>

          {/* Selected Part Details */}
          {selectedPart && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {selectedPart.name}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {selectedPart.partNumber} · {selectedPart.brand}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => {
                        setSelectedPart(null);
                        setUnitCost(0);
                        setQuantity(1);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary">
                      <Package className="h-3 w-3 mr-1" />
                      Current Stock: {selectedPart.currentStock}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    >
                      <DollarSign className="h-3 w-3 mr-1" />
                      Cost Price: {formatCurrency(selectedPart.costPrice, currency, selectedPart.currency || 'INR')}
                    </Badge>
                  </div>

                  <Separator />

                  {/* Cost and Quantity */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="unitCost" className="text-xs">
                        Unit Cost (editable)
                      </Label>
                      <div className="relative">
                        <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          id="unitCost"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={unitCost}
                          onChange={(e) =>
                            setUnitCost(parseFloat(e.target.value) || 0)
                          }
                          className="pl-7 h-9 text-sm"
                          disabled={submitting}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="purchaseQty" className="text-xs">
                        Quantity
                      </Label>
                      <Input
                        id="purchaseQty"
                        type="number"
                        min="1"
                        value={quantity}
                        onChange={(e) =>
                          setQuantity(parseInt(e.target.value) || 0)
                        }
                        className="h-9 text-sm"
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  {/* Stock Increase Preview */}
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-md px-3 py-2"
                  >
                    <Package className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      Stock will increase from {selectedPart.currentStock} to{' '}
                      <strong>{selectedPart.currentStock + quantity}</strong>
                    </span>
                  </motion.div>

                  {/* Total Preview */}
                  <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2.5">
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      Total Cost
                    </span>
                    <span className="text-lg font-bold text-amber-800 dark:text-amber-200">
                      {formatCurrency(totalCost, currency, selectedPart?.currency || 'INR')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          <Separator />

          {/* Supplier Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="supplierName" className="text-xs">
                <Factory className="h-3 w-3 mr-1 inline" />
                Supplier Name
              </Label>
              <Input
                id="supplierName"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Supplier or vendor name"
                className="h-9 text-sm"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplierPhone" className="text-xs">
                <Phone className="h-3 w-3 mr-1 inline" />
                Supplier Phone
              </Label>
              <Input
                id="supplierPhone"
                type="tel"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                placeholder="Optional"
                className="h-9 text-sm"
                disabled={submitting}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="purchaseNotes" className="text-xs">
              <FileText className="h-3 w-3 mr-1 inline" />
              Notes
            </Label>
            <Textarea
              id="purchaseNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this purchase..."
              rows={2}
              className="text-sm resize-none"
              disabled={submitting}
            />
          </div>

          {/* Footer */}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !selectedPart || quantity <= 0 || unitCost <= 0 || submitting
              }
              className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <PackageOpen className="h-4 w-4 mr-2" />
                  Record Purchase
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const { toast } = useToast();
  const currency = useAppStore((s) => s.currency)

  // Data state
  const [purchases, setPurchases] = useState<PurchaseWithPart[]>([]);
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Computed values
  const todayRange = useMemo(() => getTodayRange(), []);

  const todayPurchases = useMemo(
    () => purchases.filter((p) => isToday(new Date(p.createdAt))),
    [purchases]
  );

  const todayTotal = useMemo(
    () => todayPurchases.reduce((sum, p) => sum + p.totalCost, 0),
    [todayPurchases]
  );

  const grandTotal = useMemo(
    () => purchases.reduce((sum, p) => sum + p.totalCost, 0),
    [purchases]
  );

  // Fetch purchases — show ALL data by default, only filter when dates are set
  const fetchPurchases = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: '1', limit: '50' });
      // Only apply date filter when explicitly set by the user
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/purchases?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch purchases');
      const data: PurchasesResponse = await res.json();
      setPurchases(data.purchases);
      setTotalPurchases(data.total);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load purchases data.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, toast]);

  // Fetch departments
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments');
      if (res.ok) {
        const data = await res.json();
        setDepartments(Array.isArray(data) ? data : []);
      }
    } catch {
      // Departments are optional, don't show error
    }
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  // Listen for the global "liafon:purchases:new" event (triggered by the
  // command palette) to open the New Purchase dialog from anywhere.
  useEffect(() => {
    const onNew = () => setDialogOpen(true);
    window.addEventListener('liafon:purchases:new', onNew);
    return () => window.removeEventListener('liafon:purchases:new', onNew);
  }, []);

  // Handle new purchase submission
  const handleNewPurchase = useCallback(
    async (form: NewPurchaseForm) => {
      try {
        const res = await fetch('/api/purchases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create purchase');
        }
        toast({
          title: 'Purchase Recorded',
          description: 'The purchase has been recorded successfully.',
        });
        setDialogOpen(false);
        fetchPurchases();
      } catch (err) {
        toast({
          title: 'Error',
          description:
            err instanceof Error ? err.message : 'Failed to create purchase.',
          variant: 'destructive',
        });
      }
    },
    [toast, fetchPurchases]
  );

  // Clear date filters
  const clearFilters = useCallback(() => {
    setStartDate('');
    setEndDate('');
  }, []);

  // ── Export to CSV ────────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    if (purchases.length === 0) {
      toast({ title: 'Nothing to export', description: 'No purchases to export.', variant: 'destructive' });
      return;
    }
    const rows = purchases.map((p) => ({
      Invoice: p.invoiceNumber || '',
      Date: format(new Date(p.date), 'yyyy-MM-dd'),
      PartNumber: p.part.partNumber,
      PartName: p.part.name,
      Brand: p.part.brand,
      Quantity: p.quantity,
      UnitCost: p.unitCost,
      TotalCost: p.totalCost,
      Currency: currency,
      SupplierName: p.supplierName || '',
      SupplierPhone: p.supplierPhone || '',
      Notes: p.notes || '',
    }));
    const csv = buildCSV(rows);
    downloadCSV(`purchases_${format(new Date(), 'yyyy-MM-dd')}.csv`, csv);
    toast({ title: 'Export ready', description: `${rows.length} purchases exported` });
  }, [purchases, currency, toast]);

  // ── Loading State ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <motion.div
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <PurchasesTableSkeleton />
        </motion.div>
      </motion.div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* New Purchase Button */}
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm cursor-pointer"
          >
            <PackageOpen className="h-4 w-4 mr-2" />
            New Purchase
          </Button>

          {/* Export CSV */}
          <Button
            variant="outline"
            size="default"
            onClick={handleExportCSV}
            disabled={purchases.length === 0}
            className="cursor-pointer"
          >
            <Download className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Export</span>
          </Button>

          {/* Share All to WhatsApp — screenshot-based */}
          <Button
            variant="outline"
            size="default"
            onClick={async () => {
              if (purchases.length === 0) return;
              const tableEl = document.querySelector('[data-share-target="purchases-table"]') as HTMLElement;
              if (tableEl) {
                toast({ title: 'Capturing...', description: 'Taking screenshot of purchases data' });
                const { shareScreenshot } = await import('@/lib/screenshot');
                const caption = `📦 *Purchases Summary*\n*Total: ${formatCurrency(grandTotal, currency, 'INR')}*\n*Transactions: ${purchases.length}*\n${format(new Date(), 'MMM d, yyyy')}\n\n_Liafon Stock Management_`;
                await shareScreenshot(tableEl, caption);
                toast({ title: 'Shared', description: 'Screenshot sent to WhatsApp' });
              } else {
                const message = `📦 *Purchases Summary*\n*Total: ${formatCurrency(grandTotal, currency, 'INR')}*\n*Transactions: ${purchases.length}*`;
                window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
              }
            }}
            disabled={purchases.length === 0}
            className="cursor-pointer text-amber-600 border-amber-300 hover:bg-amber-50 dark:border-amber-700 dark:hover:bg-amber-950/30"
          >
            <Camera className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Share All</span>
          </Button>

          {/* Date Filters */}
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 w-36 sm:w-40 text-xs"
              />
            </div>
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 w-36 sm:w-40 text-xs"
            />
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Today's Purchases Card */}
        <TodayPurchasesCard total={todayTotal} count={todayPurchases.length} />
      </motion.div>

      {/* ── Purchases Table ────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} data-share-target="purchases-table">
        <Card className="overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  Purchases History
                </h2>
                <Badge variant="secondary" className="text-xs">
                  {totalPurchases} record{totalPurchases !== 1 ? 's' : ''}
                </Badge>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Part Name</TableHead>
                    <TableHead className="w-28">Part#</TableHead>
                    <TableHead className="w-14 text-center">Qty</TableHead>
                    <TableHead className="w-24 text-right">Unit Cost</TableHead>
                    <TableHead className="w-24 text-right">Total</TableHead>
                    <TableHead className="w-36">Supplier</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <PackageOpen className="h-10 w-10 mb-2 opacity-30" />
                          <p className="text-sm">No purchases found</p>
                          <p className="text-xs mt-1">
                            Record a new purchase to get started.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      <AnimatePresence mode="popLayout">
                        {purchases.map((purchase, idx) => {
                          const isTodayPurchase = isToday(
                            new Date(purchase.createdAt)
                          );
                          return (
                            <motion.tr
                              key={purchase.id}
                              custom={idx}
                              variants={rowVariants}
                              initial="hidden"
                              animate="visible"
                              exit={{ opacity: 0, x: 12 }}
                              layout
                              className={`group transition-colors hover:bg-muted/50 ${
                                isTodayPurchase
                                  ? 'bg-amber-50/50 dark:bg-amber-950/10'
                                  : ''
                              }`}
                            >
                              <TableCell className="align-middle">
                                <div className="space-y-0.5">
                                  <p className="text-sm font-medium">
                                    {formatDate(purchase.date)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatTime(purchase.createdAt)}
                                  </p>
                                </div>
                                {isTodayPurchase && (
                                  <Badge className="mt-1 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-[10px] px-1.5 py-0">
                                    Today
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="align-middle">
                                <div>
                                  <p className="text-sm font-medium truncate max-w-[200px]">
                                    {purchase.part.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {purchase.part.brand}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="align-middle font-mono text-xs text-muted-foreground">
                                {purchase.part.partNumber}
                              </TableCell>
                              <TableCell className="align-middle text-center font-semibold text-sm">
                                {purchase.quantity}
                              </TableCell>
                              <TableCell className="align-middle text-right text-sm">
                                {formatCurrency(purchase.unitCost, currency, purchase.currency || 'INR')}
                              </TableCell>
                              <TableCell className="align-middle text-right">
                                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                                  {formatCurrency(purchase.totalCost, currency, purchase.currency || 'INR')}
                                </span>
                              </TableCell>
                              <TableCell className="align-middle">
                                <div>
                                  <p className="text-sm truncate max-w-[140px]">
                                    {purchase.supplierName || '—'}
                                  </p>
                                  {purchase.supplierPhone && (
                                    <p className="text-xs text-muted-foreground">
                                      {purchase.supplierPhone}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="align-middle">
                                <WhatsAppShareButton
                                  purchase={purchase}
                                  departments={departments}
                                />
                              </TableCell>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>

                      {/* Running Total */}
                      <TableRow className="border-t-2 border-foreground/10 bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={5} className="align-middle">
                          <span className="text-sm font-semibold text-muted-foreground">
                            Running Total ({purchases.length} purchases)
                          </span>
                        </TableCell>
                        <TableCell className="align-middle text-right">
                          <span className="text-base font-bold text-amber-700 dark:text-amber-300">
                            {formatCurrency(grandTotal, currency, 'INR')}
                          </span>
                        </TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  Purchases History
                </h2>
                <Badge variant="secondary" className="text-xs">
                  {totalPurchases} record{totalPurchases !== 1 ? 's' : ''}
                </Badge>
              </div>

              <ScrollArea className="max-h-[calc(100vh-320px)]">
                <div className="space-y-3">
                  {purchases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <PackageOpen className="h-10 w-10 mb-2 opacity-30" />
                      <p className="text-sm">No purchases found</p>
                      <p className="text-xs mt-1">
                        Record a new purchase to get started.
                      </p>
                    </div>
                  ) : (
                    <>
                      <AnimatePresence>
                        {purchases.map((purchase, idx) => {
                          const isTodayPurchase = isToday(
                            new Date(purchase.createdAt)
                          );
                          return (
                            <motion.div
                              key={purchase.id}
                              custom={idx}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -12 }}
                              transition={{
                                delay: idx * 0.03,
                                duration: 0.25,
                              }}
                            >
                              <Card
                                className={`p-3.5 ${
                                  isTodayPurchase
                                    ? 'border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/10'
                                    : ''
                                }`}
                              >
                                {/* Header row */}
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold truncate">
                                        {purchase.part.name}
                                      </p>
                                      {isTodayPurchase && (
                                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-[10px] px-1.5 py-0 flex-shrink-0">
                                          Today
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                      #{purchase.part.partNumber} ·{' '}
                                      {purchase.part.brand}
                                    </p>
                                  </div>
                                  <WhatsAppShareButton
                                    purchase={purchase}
                                    departments={departments}
                                  />
                                </div>

                                {/* Details row */}
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                  <div>
                                    <p className="text-[10px] uppercase text-muted-foreground font-medium">
                                      Qty
                                    </p>
                                    <p className="text-sm font-semibold">
                                      {purchase.quantity}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase text-muted-foreground font-medium">
                                      Unit Cost
                                    </p>
                                    <p className="text-sm">
                                      {formatCurrency(purchase.unitCost, currency, purchase.currency || 'INR')}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase text-muted-foreground font-medium">
                                      Total
                                    </p>
                                    <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                                      {formatCurrency(purchase.totalCost, currency, purchase.currency || 'INR')}
                                    </p>
                                  </div>
                                </div>

                                {/* Footer row */}
                                <Separator className="my-2" />
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground truncate">
                                      {purchase.supplierName
                                        ? `${purchase.supplierName}${purchase.supplierPhone ? ` · ${purchase.supplierPhone}` : ''}`
                                        : 'No supplier info'}
                                    </p>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground flex-shrink-0">
                                    {formatDate(purchase.date)},{' '}
                                    {formatTime(purchase.createdAt)}
                                  </p>
                                </div>
                              </Card>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>

                      {/* Running Total */}
                      <Card className="p-3.5 bg-muted/30 border-foreground/10">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            Running Total ({purchases.length} purchases)
                          </span>
                          <span className="text-base font-bold text-amber-700 dark:text-amber-300">
                            {formatCurrency(grandTotal, currency, 'INR')}
                          </span>
                        </div>
                      </Card>
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ── New Purchase Dialog ────────────────────────────────────────────── */}
      <NewPurchaseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleNewPurchase}
      />
    </motion.div>
  );
}