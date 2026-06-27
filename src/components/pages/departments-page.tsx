'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Plus,
  Phone,
  Mail,
  Pencil,
  Trash2,
  MessageSquare,
  Loader2,
  Building2,
  Users,
  AlertTriangle,
  Search,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { useToast } from '@/hooks/use-toast';
import {
  openWhatsApp,
  type DepartmentRole,
  type Department,
} from '@/lib/whatsapp';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DepartmentFormData {
  name: string;
  phone: string;
  role: DepartmentRole;
  email: string;
}

interface DepartmentWithDates extends Department {
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: DepartmentRole; label: string }[] = [
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'sales', label: 'Sales' },
  { value: 'purchasing', label: 'Purchasing' },
  { value: 'management', label: 'Management' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'general', label: 'General' },
];

const ROLE_COLORS: Record<DepartmentRole, string> = {
  warehouse:
    'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
  sales:
    'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  purchasing:
    'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  management:
    'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
  accounts:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  general:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

const ROLE_ICON_COLORS: Record<DepartmentRole, string> = {
  warehouse: 'bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400',
  sales: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
  purchasing: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
  management: 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400',
  accounts: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  general: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
};

const ROLE_ACCENT_COLORS: Record<DepartmentRole, string> = {
  warehouse: 'border-t-teal-500',
  sales: 'border-t-emerald-500',
  purchasing: 'border-t-amber-500',
  management: 'border-t-rose-500',
  accounts: 'border-t-slate-500',
  general: 'border-t-slate-500',
};

const emptyForm: DepartmentFormData = {
  name: '',
  phone: '',
  role: 'general',
  email: '',
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' as const },
  },
};

// ─── Sub-Components ──────────────────────────────────────────────────────────

function DepartmentCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1 min-w-0">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
        <Separator />
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 flex-1 rounded-md" />
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-16 px-6"
    >
      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 mb-4">
        <Users className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">No Departments</h3>
      <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
        Get started by adding your first department to manage your team.
      </p>
      <Button onClick={onAdd} className="gap-2">
        <Plus className="h-4 w-4" />
        Add Department
      </Button>
    </motion.div>
  );
}

function DepartmentCard({
  department,
  onEdit,
  onDelete,
  onTestWhatsApp,
}: {
  department: DepartmentWithDates;
  onEdit: (dept: DepartmentWithDates) => void;
  onDelete: (dept: DepartmentWithDates) => void;
  onTestWhatsApp: (dept: DepartmentWithDates) => void;
}) {
  const role = department.role as DepartmentRole;

  return (
    <motion.div variants={itemVariants}>
      <Card className={`overflow-hidden border-t-2 ${ROLE_ACCENT_COLORS[role]} hover:shadow-md transition-shadow duration-200`}>
        <CardContent className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-foreground truncate">
                {department.name}
              </h3>
              <Badge className={`mt-1.5 ${ROLE_COLORS[role]} border text-xs font-medium`}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </Badge>
            </div>
            <div className={`flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-full ml-3 ${ROLE_ICON_COLORS[role]}`}>
              <Building2 className="h-4 w-4" />
            </div>
          </div>

          <Separator className="my-3" />

          {/* Contact Info */}
          <div className="space-y-2.5 mb-4">
            {/* Phone */}
            <a
              href={`https://wa.me/${department.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 text-sm group"
            >
              <Phone className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
              <span className="text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors truncate">
                {department.phone}
              </span>
              <svg
                className="h-3 w-3 text-emerald-500 ml-auto flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </a>

            {/* Email */}
            {department.email && (
              <div className="flex items-center gap-2.5 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground truncate">{department.email}</span>
              </div>
            )}

            {/* Created */}
            <p className="text-xs text-muted-foreground">
              Added {format(new Date(department.createdAt), 'MMM d, yyyy')}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(department)}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Pencil className="h-3 w-3" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Edit department</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(department)}
                  className="h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-950/50 border-rose-200 dark:border-rose-800"
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Delete department</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onTestWhatsApp(department)}
                  className="h-8 gap-1.5 text-xs flex-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800"
                >
                  <MessageSquare className="h-3 w-3" />
                  <span>Test Message</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Send a test WhatsApp message</TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DepartmentsPage() {
  const { toast } = useToast();

  // Data state
  const [departments, setDepartments] = useState<DepartmentWithDates[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentWithDates | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState<DepartmentFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof DepartmentFormData, string>>>({});
  const [deleteTarget, setDeleteTarget] = useState<DepartmentWithDates | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const fetchDepartments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/departments');
      if (!res.ok) throw new Error('Failed to fetch departments');
      const data = await res.json();
      setDepartments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  // ── Form Helpers ─────────────────────────────────────────────────────────

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof DepartmentFormData, string>> = {};

    if (!form.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!form.phone.trim()) {
      errors.phone = 'Phone is required';
    } else {
      // Strip non-digits then validate length (6-15 digits, E.164-ish)
      const digits = form.phone.replace(/[^0-9]/g, '');
      if (digits.length < 6 || digits.length > 15) {
        errors.phone = 'Phone must be 6 to 15 digits';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const openAddDialog = useCallback(() => {
    setEditingDept(null);
    setForm(emptyForm);
    setFormErrors({});
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((dept: DepartmentWithDates) => {
    setEditingDept(dept);
    setForm({
      name: dept.name,
      phone: dept.phone,
      role: dept.role as DepartmentRole,
      email: dept.email,
    });
    setFormErrors({});
    setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    try {
      setSubmitting(true);

      const body = {
        name: form.name.trim(),
        phone: form.phone.replace(/[^0-9]/g, ''),
        role: form.role,
        email: form.email.trim(),
      };

      if (editingDept) {
        const res = await fetch(`/api/departments/${editingDept.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to update department');
        toast({ title: 'Department updated', description: `${body.name} has been updated.` });
      } else {
        const res = await fetch('/api/departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to create department');
        toast({ title: 'Department created', description: `${body.name} has been added.` });
      }

      setDialogOpen(false);
      fetchDepartments();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, editingDept, fetchDepartments, toast]);

  const handleDelete = useCallback(
    (dept: DepartmentWithDates) => {
      setDeleteTarget(dept);
    },
    []
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/departments/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete department');
      toast({ title: 'Department deleted', description: `${deleteTarget.name} has been removed.` });
      fetchDepartments();
      setDeleteTarget(null);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete department',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchDepartments, toast]);

  const handleTestWhatsApp = useCallback(
    (dept: DepartmentWithDates) => {
      const message = `🧪 *TEST MESSAGE*\n━━━━━━━━━━━━━━━\n✅ WhatsApp integration is working!\n📢 Sent to: ${dept.name}\n📅 Time: ${format(new Date(), 'MMM d, yyyy h:mm a')}\n━━━━━━━━━━━━━━━\n_Liafon Stock Management System_`;
      openWhatsApp(dept.phone, message);
      toast({ title: 'WhatsApp opened', description: `Test message prepared for ${dept.name}.` });
    },
    [toast]
  );

  // ── Filtering ────────────────────────────────────────────────────────────

  const filteredDepartments = departments.filter((dept) => {
    const q = searchQuery.toLowerCase();
    return (
      dept.name.toLowerCase().includes(q) ||
      dept.role.toLowerCase().includes(q) ||
      dept.email.toLowerCase().includes(q) ||
      dept.phone.includes(q)
    );
  });

  // ── Loading State ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <DepartmentCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ── Error State ──────────────────────────────────────────────────────────

  if (error) {
    return (
      <Card className="p-6 border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-500 flex-shrink-0" />
          <div>
            <p className="font-medium text-rose-700 dark:text-rose-300">
              Failed to load departments
            </p>
            <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDepartments} className="ml-auto gap-1.5">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              Departments
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {departments.length} department{departments.length !== 1 ? 's' : ''} registered
            </p>
          </div>
          <Button onClick={openAddDialog} className="gap-2 self-start">
            <Plus className="h-4 w-4" />
            Add Department
          </Button>
        </div>

        {/* Search */}
        {departments.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search departments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {/* Department Grid */}
        {filteredDepartments.length === 0 && !searchQuery ? (
          <EmptyState onAdd={openAddDialog} />
        ) : filteredDepartments.length === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">No departments match &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence mode="popLayout">
              {filteredDepartments.map((dept) => (
                <DepartmentCard
                  key={dept.id}
                  department={dept}
                  onEdit={openEditDialog}
                  onDelete={handleDelete}
                  onTestWhatsApp={handleTestWhatsApp}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDept ? 'Edit Department' : 'Add Department'}</DialogTitle>
            <DialogDescription>
              {editingDept
                ? `Update ${editingDept.name} details.`
                : 'Fill in the details to add a new department.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="dept-name">
                Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="dept-name"
                placeholder="e.g. Main Warehouse"
                value={form.name}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, name: e.target.value }));
                  if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: undefined }));
                }}
                className={formErrors.name ? 'border-rose-300 dark:border-rose-700' : ''}
              />
              {formErrors.name && (
                <p className="text-xs text-rose-500">{formErrors.name}</p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="dept-phone">
                Phone <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="dept-phone"
                placeholder="e.g. 1234567890"
                value={form.phone}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, phone: e.target.value }));
                  if (formErrors.phone) setFormErrors((prev) => ({ ...prev, phone: undefined }));
                }}
                className={formErrors.phone ? 'border-rose-300 dark:border-rose-700' : ''}
              />
              {formErrors.phone && (
                <p className="text-xs text-rose-500">{formErrors.phone}</p>
              )}
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="dept-role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, role: value as DepartmentRole }))
                }
              >
                <SelectTrigger id="dept-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="dept-email">Email</Label>
              <Input
                id="dept-email"
                type="email"
                placeholder="e.g. warehouse@autoparts.com"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingDept ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete department?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate <strong>{deleteTarget?.name}</strong>. The
              department will be hidden from the active list but kept in the
              database for historical references. You can reactivate it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-300"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
