'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, isToday, startOfDay, endOfDay } from 'date-fns';
import {
  Plus,
  Search,
  X,
  ShoppingCart,
  AlertTriangle,
  Package,
  Calendar,
  Phone,
  User,
  FileText,
  MessageSquare,
  Camera,
  Send,
  Loader2,
  TrendingUp,
  Printer,
  Download,
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
  formatSaleMessage,
  openWhatsApp,
  type Department,
} from '@/lib/whatsapp';
import { printInvoice, buildCSV, downloadCSV } from '@/lib/print';

import { useAppStore } from '@/store/app-store'
import { formatCurrency, getCurrencySymbol } from '@/lib/currency'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SparePart {
  id: string;
  name: string;
  partNumber: string;
  brand: string;
  currentStock: number;
  sellingPrice: number;
  currency?: string;
  category?: string;
  costPrice?: number;
  minStockLevel?: number;
}

interface SaleWithPart {
  id: string;
  partId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  customerName: string;
  customerPhone: string;
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
    sellingPrice: number;
    currency?: string;
  };
}

interface SalesResponse {
  sales: SaleWithPart[];
  total: number;
  page: number;
  limit: number;
}

interface NewSaleForm {
  partId: string;
  partName: string;
  partNumber: string;
  availableStock: number;
  unitPrice: number;
  quantity: number;
  customerName: string;
  customerPhone: string;
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

function SalesTableSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-40" />
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

function TodaySalesCard({
  total,
  count,
  currency,
}: {
  total: number;
  count: number;
  currency: string;
}) {
  return (
    <motion.div variants={itemVariants}>
      <Card className="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/60 flex-shrink-0">
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Today&apos;s Sales
            </p>
            <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
              {formatCurrency(total, currency, 'INR')}
            </p>
          </div>
          <Badge
            variant="secondary"
            className="ml-auto bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 text-xs flex-shrink-0"
          >
            {count} {count === 1 ? 'sale' : 'sales'}
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
  currency,
}: {
  onSelect: (part: SparePart) => void;
  disabled: boolean;
  currency: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SparePart[]>([]);
  const [searching, setSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchParts = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setSearching(true);
    // Abort any in-flight search so rapid typing doesn't cause stale
    // results to win the race (e.g. user types "brake", then "brakes",
    // and the "brake" response arrives last overwriting "brakes").
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(
        `/api/parts?search=${encodeURIComponent(searchQuery)}&limit=10`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      if (res.ok) {
        const data = await res.json();
        if (controller.signal.aborted) return;
        setResults(data.parts || []);
        setIsOpen(data.parts?.length > 0);
        setHighlightIndex(-1);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setResults([]);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
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
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100'
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
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(part.sellingPrice, currency, part.currency || 'INR')}
                        </span>
                        <span
                          className={`text-xs mt-0.5 ${
                            part.currentStock <= 5
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-muted-foreground'
                          }`}
                        >
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
  sale,
  departments,
  currency,
}: {
  sale: SaleWithPart;
  departments: Department[];
  currency: string;
}) {
  const handleShareToDepartment = useCallback(
    (department: Department) => {
      const message = formatSaleMessage({
        partName: sale.part.name,
        partNumber: sale.part.partNumber,
        quantity: sale.quantity,
        unitPrice: sale.unitPrice,
        totalPrice: sale.totalPrice,
        customerName: sale.customerName || 'Walk-in',
        date: formatDate(sale.date),
        currency,
      });
      openWhatsApp(department.phone, message);
    },
    [sale, currency]
  );

  const handleSendToAll = useCallback(() => {
    const message = formatSaleMessage({
      partName: sale.part.name,
      partNumber: sale.part.partNumber,
      quantity: sale.quantity,
      unitPrice: sale.unitPrice,
      totalPrice: sale.totalPrice,
      customerName: sale.customerName || 'Walk-in',
      date: formatDate(sale.date),
      currency,
    });
    departments.forEach((dept) => {
      setTimeout(() => openWhatsApp(dept.phone, message), 100);
    });
  }, [sale, departments, currency]);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/50"
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
            <Phone className="h-3.5 w-3.5 mr-2 text-emerald-500" />
            <span className="truncate">{dept.name}</span>
          </DropdownMenuItem>
        ))}
        {departments.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSendToAll}
              className="cursor-pointer text-emerald-600 dark:text-emerald-400"
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

// ─── Print Invoice Button ───────────────────────────────────────────────────

function PrintInvoiceButton({
  sale,
  currency,
}: {
  sale: SaleWithPart;
  currency: string;
}) {
  const handlePrint = useCallback(() => {
    printInvoice({
      invoiceNumber: sale.invoiceNumber || sale.id.slice(-8).toUpperCase(),
      date: sale.date,
      customerName: sale.customerName || 'Walk-in Customer',
      customerPhone: sale.customerPhone,
      notes: sale.notes,
      currency,
      items: [
        {
          partNumber: sale.part.partNumber,
          name: sale.part.name,
          brand: sale.part.brand,
          quantity: sale.quantity,
          unitPrice: sale.unitPrice,
          totalPrice: sale.totalPrice,
        },
      ],
      subtotal: sale.totalPrice,
      total: sale.totalPrice,
    });
  }, [sale, currency]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
          onClick={handlePrint}
          aria-label="Print invoice"
        >
          <Printer className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>Print / Save as PDF</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── New Sale Dialog ─────────────────────────────────────────────────────────

function NewSaleDialog({
  open,
  onOpenChange,
  onSubmit,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: Omit<NewSaleForm, 'partName' | 'partNumber' | 'availableStock'>) => Promise<void>;
  currency: string;
}) {
  const [selectedPart, setSelectedPart] = useState<SparePart | null>(null);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const totalPrice = unitPrice * quantity;
  const isOverStock = selectedPart ? quantity > selectedPart.currentStock : false;

  const handlePartSelect = useCallback((part: SparePart) => {
    setSelectedPart(part);
    setUnitPrice(part.sellingPrice);
    setQuantity(1);
  }, []);

  const resetForm = useCallback(() => {
    setSelectedPart(null);
    setUnitPrice(0);
    setQuantity(1);
    setCustomerName('');
    setCustomerPhone('');
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
      if (!selectedPart || quantity <= 0 || unitPrice <= 0) return;

      setSubmitting(true);
      try {
        await onSubmit({
          partId: selectedPart.id,
          unitPrice,
          quantity,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          notes: notes.trim(),
        });
        resetForm();
      } finally {
        setSubmitting(false);
      }
    },
    [selectedPart, unitPrice, quantity, customerName, customerPhone, notes, onSubmit, resetForm]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            New Sale
          </DialogTitle>
          <DialogDescription>
            Search for a part and fill in the sale details.
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
              currency={currency}
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
                        setUnitPrice(0);
                        setQuantity(1);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <Badge
                      variant="secondary"
                      className={
                        selectedPart.currentStock <= 5
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          : ''
                      }
                    >
                      <Package className="h-3 w-3 mr-1" />
                      Stock: {selectedPart.currentStock}
                    </Badge>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {getCurrencySymbol(currency)}
                      {formatCurrency(selectedPart.sellingPrice, currency, selectedPart.currency || 'INR')}
                    </Badge>
                  </div>

                  <Separator />

                  {/* Price and Quantity */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="unitPrice" className="text-xs">
                        Unit Price
                      </Label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                          {getCurrencySymbol(currency)}
                        </span>
                        <Input
                          id="unitPrice"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={unitPrice}
                          onChange={(e) =>
                            setUnitPrice(parseFloat(e.target.value) || 0)
                          }
                          className="pl-7 h-9 text-sm"
                          disabled={submitting}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="quantity" className="text-xs">
                        Quantity
                      </Label>
                      <Input
                        id="quantity"
                        type="number"
                        min="1"
                        max={selectedPart.currentStock}
                        value={quantity}
                        onChange={(e) =>
                          setQuantity(parseInt(e.target.value) || 0)
                        }
                        className="h-9 text-sm"
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  {/* Stock Warning */}
                  {isOverStock && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        Quantity ({quantity}) exceeds available stock (
                        {selectedPart.currentStock}).
                      </span>
                    </motion.div>
                  )}

                  {/* Total Preview */}
                  <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 rounded-md px-3 py-2.5">
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      Total Amount
                    </span>
                    <span className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
                      {formatCurrency(totalPrice, currency, selectedPart?.currency || 'INR')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          <Separator />

          {/* Customer Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="customerName" className="text-xs">
                <User className="h-3 w-3 mr-1 inline" />
                Customer Name
              </Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in customer"
                className="h-9 text-sm"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customerPhone" className="text-xs">
                <Phone className="h-3 w-3 mr-1 inline" />
                Customer Phone
              </Label>
              <Input
                id="customerPhone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Optional"
                className="h-9 text-sm"
                disabled={submitting}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs">
              <FileText className="h-3 w-3 mr-1 inline" />
              Notes
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this sale..."
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
              disabled={!selectedPart || quantity <= 0 || unitPrice <= 0 || submitting || isOverStock}
              className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Create Sale
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

export default function SalesPage() {
  const { toast } = useToast();
  const currency = useAppStore((s) => s.currency);

  // Data state
  const [sales, setSales] = useState<SaleWithPart[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Computed values
  const todayRange = useMemo(() => getTodayRange(), []);

  const todaySales = useMemo(
    () =>
      sales.filter((s) => isToday(new Date(s.createdAt))),
    [sales]
  );

  const todayTotal = useMemo(
    () => todaySales.reduce((sum, s) => sum + s.totalPrice, 0),
    [todaySales]
  );

  const grandTotal = useMemo(
    () => sales.reduce((sum, s) => sum + s.totalPrice, 0),
    [sales]
  );

  // Fetch sales — show ALL data by default, only filter when dates are set
  const fetchSales = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: '1', limit: '50' });
      // Only apply date filter when explicitly set by the user
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/sales?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch sales');
      const data: SalesResponse = await res.json();
      setSales(data.sales);
      setTotalSales(data.total);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load sales data.',
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
    fetchSales();
  }, [fetchSales]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  // Listen for the global "liafon:sales:new" event (triggered by the
  // command palette) to open the New Sale dialog from anywhere.
  useEffect(() => {
    const onNew = () => setDialogOpen(true);
    window.addEventListener('liafon:sales:new', onNew);
    return () => window.removeEventListener('liafon:sales:new', onNew);
  }, []);

  // Handle new sale submission
  const handleNewSale = useCallback(
    async (form: Omit<NewSaleForm, 'partName' | 'partNumber' | 'availableStock'>) => {
      try {
        const res = await fetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to create sale');
        }
        toast({
          title: 'Sale Created',
          description: 'The sale has been recorded successfully.',
        });
        setDialogOpen(false);
        fetchSales();
      } catch (err) {
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to create sale.',
          variant: 'destructive',
        });
      }
    },
    [toast, fetchSales]
  );

  // Clear date filters
  const clearFilters = useCallback(() => {
    setStartDate('');
    setEndDate('');
  }, []);

  // ── Export to CSV ────────────────────────────────────────────────────
  // IMPORTANT: This useCallback MUST be called before any early return,
  // otherwise React's Rules of Hooks are violated ("Rendered more hooks
  // than during the previous render"). All hooks must run in the same
  // order on every render.
  const handleExportCSV = useCallback(() => {
    if (sales.length === 0) {
      toast({
        title: 'Nothing to export',
        description: 'There are no sales matching the current filters.',
        variant: 'destructive',
      });
      return;
    }
    const rows = sales.map((s) => ({
      Invoice: s.invoiceNumber || '',
      Date: formatDate(s.date),
      Time: formatTime(s.createdAt),
      PartNumber: s.part.partNumber,
      PartName: s.part.name,
      Brand: s.part.brand,
      Quantity: s.quantity,
      UnitPrice: s.unitPrice,
      TotalPrice: s.totalPrice,
      Currency: currency,
      CustomerName: s.customerName || 'Walk-in',
      CustomerPhone: s.customerPhone || '',
      Notes: s.notes || '',
    }));
    const csv = buildCSV(rows);
    const filename = `sales_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    downloadCSV(filename, csv);
    toast({
      title: 'Export ready',
      description: `${rows.length} sales exported to ${filename}`,
    });
  }, [sales, currency, toast]);

  // ── Loading State ───────────────────────────────────────────────────────
  // Use inline conditional instead of early return so there's zero
  // chance of violating the Rules of Hooks (a previous version had
  // handleExportCSV called after an early return, which crashed the
  // page with "Rendered more hooks than during the previous render").

  if (loading) {
    return (
      <motion.div
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <SalesTableSkeleton />
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
          {/* New Sale Button */}
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Sale
          </Button>

          {/* Export CSV Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={sales.length === 0}
            className="cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>

          {/* Share All to WhatsApp — screenshot-based */}
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (sales.length === 0) return;
              // Find the sales table container to screenshot
              const tableEl = document.querySelector('[data-share-target="sales-table"]') as HTMLElement;
              if (tableEl) {
                toast({ title: 'Capturing...', description: 'Taking screenshot of sales data' });
                const { shareScreenshot } = await import('@/lib/screenshot');
                const caption = `📊 *Sales Summary*\n*Total: ${formatCurrency(grandTotal, currency, 'INR')}*\n*Transactions: ${sales.length}*\n${format(new Date(), 'MMM d, yyyy')}\n\n_Liafon Stock Management_`;
                await shareScreenshot(tableEl, caption);
                toast({ title: 'Shared', description: 'Screenshot sent to WhatsApp' });
              } else {
                // Fallback to text
                const message = `📊 *Sales Summary*\n*Total: ${formatCurrency(grandTotal, currency, 'INR')}*\n*Transactions: ${sales.length}*\n${format(new Date(), 'MMM d, yyyy')}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
              }
            }}
            disabled={sales.length === 0}
            className="cursor-pointer text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:border-emerald-700 dark:hover:bg-emerald-950/30"
          >
            <Camera className="h-3.5 w-3.5 mr-1.5" />
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

        {/* Today's Sales Card */}
        <TodaySalesCard total={todayTotal} count={todaySales.length} currency={currency} />
      </motion.div>

      {/* ── Sales Table ────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} data-share-target="sales-table">
        <Card className="overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  Sales History
                </h2>
                <Badge variant="secondary" className="text-xs">
                  {totalSales} record{totalSales !== 1 ? 's' : ''}
                </Badge>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Part Name</TableHead>
                    <TableHead className="w-28">Part#</TableHead>
                    <TableHead className="w-14 text-center">Qty</TableHead>
                    <TableHead className="w-24 text-right">Unit Price</TableHead>
                    <TableHead className="w-24 text-right">Total</TableHead>
                    <TableHead className="w-36">Customer</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <ShoppingCart className="h-10 w-10 mb-2 opacity-30" />
                          <p className="text-sm">No sales found</p>
                          <p className="text-xs mt-1">
                            Create a new sale to get started.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      <AnimatePresence mode="popLayout">
                        {sales.map((sale, idx) => {
                          const isTodaySale = isToday(
                            new Date(sale.createdAt)
                          );
                          return (
                            <motion.tr
                              key={sale.id}
                              custom={idx}
                              variants={rowVariants}
                              initial="hidden"
                              animate="visible"
                              exit={{ opacity: 0, x: 12 }}
                              layout
                              className={`group transition-colors hover:bg-muted/50 ${
                                isTodaySale
                                  ? 'bg-emerald-50/50 dark:bg-emerald-950/10'
                                  : ''
                              }`}
                            >
                              <TableCell className="align-middle">
                                <div className="space-y-0.5">
                                  <p className="text-sm font-medium">
                                    {formatDate(sale.date)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {formatTime(sale.createdAt)}
                                  </p>
                                </div>
                                {isTodaySale && (
                                  <Badge className="mt-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] px-1.5 py-0">
                                    Today
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="align-middle">
                                <div>
                                  <p className="text-sm font-medium truncate max-w-[200px]">
                                    {sale.part.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {sale.part.brand}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="align-middle font-mono text-xs text-muted-foreground">
                                {sale.part.partNumber}
                              </TableCell>
                              <TableCell className="align-middle text-center font-semibold text-sm">
                                {sale.quantity}
                              </TableCell>
                              <TableCell className="align-middle text-right text-sm">
                                {formatCurrency(sale.unitPrice, currency, sale.currency || 'INR')}
                              </TableCell>
                              <TableCell className="align-middle text-right">
                                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                                  {formatCurrency(sale.totalPrice, currency, sale.currency || 'INR')}
                                </span>
                              </TableCell>
                              <TableCell className="align-middle">
                                <div>
                                  <p className="text-sm truncate max-w-[140px]">
                                    {sale.customerName || 'Walk-in'}
                                  </p>
                                  {sale.customerPhone && (
                                    <p className="text-xs text-muted-foreground">
                                      {sale.customerPhone}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="align-middle">
                                <div className="flex items-center gap-1">
                                  <WhatsAppShareButton
                                    sale={sale}
                                    departments={departments}
                                    currency={currency}
                                  />
                                  <PrintInvoiceButton
                                    sale={sale}
                                    currency={currency}
                                  />
                                </div>
                              </TableCell>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>

                      {/* Running Total */}
                      <TableRow className="border-t-2 border-foreground/10 bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={5} className="align-middle">
                          <span className="text-sm font-semibold text-muted-foreground">
                            Running Total ({sales.length} sales)
                          </span>
                        </TableCell>
                        <TableCell className="align-middle text-right">
                          <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">
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
                  Sales History
                </h2>
                <Badge variant="secondary" className="text-xs">
                  {totalSales} record{totalSales !== 1 ? 's' : ''}
                </Badge>
              </div>

              <ScrollArea className="max-h-[calc(100vh-320px)]">
                <div className="space-y-3">
                  {sales.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <ShoppingCart className="h-10 w-10 mb-2 opacity-30" />
                      <p className="text-sm">No sales found</p>
                      <p className="text-xs mt-1">
                        Create a new sale to get started.
                      </p>
                    </div>
                  ) : (
                    <>
                      <AnimatePresence>
                        {sales.map((sale, idx) => {
                          const isTodaySale = isToday(
                            new Date(sale.createdAt)
                          );
                          return (
                            <motion.div
                              key={sale.id}
                              custom={idx}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -12 }}
                              transition={{ delay: idx * 0.03, duration: 0.25 }}
                            >
                              <Card
                                className={`p-3.5 ${
                                  isTodaySale
                                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/10'
                                    : ''
                                }`}
                              >
                                {/* Header row */}
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-semibold truncate">
                                        {sale.part.name}
                                      </p>
                                      {isTodaySale && (
                                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] px-1.5 py-0 flex-shrink-0">
                                          Today
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                      #{sale.part.partNumber} · {sale.part.brand}
                                    </p>
                                  </div>
                                  <WhatsAppShareButton
                                    sale={sale}
                                    departments={departments}
                                    currency={currency}
                                  />
                                </div>

                                {/* Details row */}
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                  <div>
                                    <p className="text-[10px] uppercase text-muted-foreground font-medium">
                                      Qty
                                    </p>
                                    <p className="text-sm font-semibold">
                                      {sale.quantity}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase text-muted-foreground font-medium">
                                      Unit Price
                                    </p>
                                    <p className="text-sm">
                                      {formatCurrency(sale.unitPrice, currency, sale.currency || 'INR')}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] uppercase text-muted-foreground font-medium">
                                      Total
                                    </p>
                                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                                      {formatCurrency(sale.totalPrice, currency, sale.currency || 'INR')}
                                    </p>
                                  </div>
                                </div>

                                {/* Footer row */}
                                <Separator className="my-2" />
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground truncate">
                                      {sale.customerName
                                        ? sale.customerName
                                        : 'Walk-in customer'}
                                      {sale.customerPhone
                                        ? ` · ${sale.customerPhone}`
                                        : ''}
                                    </p>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground flex-shrink-0">
                                    {formatDate(sale.date)},{' '}
                                    {formatTime(sale.createdAt)}
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
                            Running Total ({sales.length} sales)
                          </span>
                          <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">
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

      {/* ── New Sale Dialog ────────────────────────────────────────────── */}
      <NewSaleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleNewSale}
        currency={currency}
      />
    </motion.div>
  );
}
