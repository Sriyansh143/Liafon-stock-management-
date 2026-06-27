'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ShieldCheck,
  Search,
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  Eye,
  EyeOff,
  Info,
  Clock,
  Mail,
  User,
  Crown,
  Shield,
  BarChart3,
  ShoppingCart,
  Package,
  LayoutDashboard,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/currency';

// ─── Types ───────────────────────────────────────────────────────────────────

type UserRole = 'owner' | 'admin' | 'manager' | 'user';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  {
    value: 'owner',
    label: 'Owner',
    description: 'Full access + user management',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Full access to all features',
  },
  {
    value: 'manager',
    label: 'Manager',
    description: 'Inventory, sales, purchases, reports, dashboard',
  },
  {
    value: 'user',
    label: 'User',
    description: 'Dashboard, inventory, sales only',
  },
];

const ROLE_COLORS: Record<UserRole, string> = {
  owner:
    'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  admin:
    'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  manager:
    'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  user:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

const ROLE_PERMISSIONS: Record<UserRole, { icon: React.ElementType; permissions: string[] }> = {
  owner: {
    icon: Crown,
    permissions: [
      'Dashboard',
      'Inventory',
      'Sales',
      'Purchases',
      'Reports',
      'Settings',
      'User Management',
      'All Departments',
    ],
  },
  admin: {
    icon: Shield,
    permissions: [
      'Dashboard',
      'Inventory',
      'Sales',
      'Purchases',
      'Reports',
      'Settings',
      'All Departments',
    ],
  },
  manager: {
    icon: BarChart3,
    permissions: ['Dashboard', 'Inventory', 'Sales', 'Purchases', 'Reports'],
  },
  user: {
    icon: User,
    permissions: ['Dashboard', 'Inventory', 'Sales'],
  },
};

const ROLE_PERMISSION_ICONS: Record<string, React.ElementType> = {
  Dashboard: LayoutDashboard,
  Inventory: Package,
  Sales: ShoppingCart,
  Purchases: ShoppingCart,
  Reports: BarChart3,
  Settings: ShieldCheck,
  'User Management': Users,
  'All Departments': Users,
};

const emptyForm: UserFormData = {
  name: '',
  email: '',
  password: '',
  role: 'user',
};

// ─── Animation variants ────────────────────────────────────────────────────

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

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.25, ease: 'easeOut' as const },
  },
  exit: {
    opacity: 0,
    x: 10,
    transition: { duration: 0.2, ease: 'easeIn' as const },
  },
};

// ─── Sub-Components ─────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-64 ml-auto" />
          </div>
        </div>
        <Separator />
        <div className="space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-24 ml-auto" />
              <div className="flex gap-2 ml-4">
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
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
      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-950/60 mb-4">
        <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">No Users Yet</h3>
      <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
        Get started by adding your first user account to the Liafon Stock Management system.
      </p>
      <Button onClick={onAdd} className="gap-2">
        <Plus className="h-4 w-4" />
        Add User
      </Button>
    </motion.div>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge className={`${ROLE_COLORS[role]} border text-xs font-medium`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </Badge>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 border text-xs font-medium gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
      Active
    </Badge>
  ) : (
    <Badge className="bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 border text-xs font-medium gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
      Inactive
    </Badge>
  );
}

function RolePermissionsInfo({ role }: { role: UserRole }) {
  const info = ROLE_PERMISSIONS[role];
  const IconComponent = info.icon;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconComponent className="h-4 w-4 text-muted-foreground" />
        <span>
          {role.charAt(0).toUpperCase() + role.slice(1)} Permissions
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {info.permissions.map((perm) => {
          const PermIcon = ROLE_PERMISSION_ICONS[perm];
          return (
            <Badge
              key={perm}
              variant="secondary"
              className="text-[11px] gap-1 font-normal"
            >
              {PermIcon && <PermIcon className="h-3 w-3" />}
              {perm}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function UsersPage() {
  const { toast } = useToast();

  // Data state
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form dialog state
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});
  const [showPassword, setShowPassword] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ── Form Helpers ─────────────────────────────────────────────────────────

  const validateForm = useCallback(
    (isEditing: boolean): boolean => {
      const errors: Partial<Record<keyof UserFormData, string>> = {};

      if (!form.name.trim()) {
        errors.name = 'Name is required';
      }

      if (!form.email.trim()) {
        errors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        errors.email = 'Please enter a valid email address';
      }

      if (!isEditing && !form.password.trim()) {
        errors.password = 'Password is required';
      } else if (form.password && form.password.length < 6) {
        errors.password = 'Password must be at least 6 characters';
      }

      setFormErrors(errors);
      return Object.keys(errors).length === 0;
    },
    [form]
  );

  const openAddDialog = useCallback(() => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormErrors({});
    setShowPassword(false);
    setFormDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((user: User) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
    });
    setFormErrors({});
    setShowPassword(false);
    setFormDialogOpen(true);
  }, []);

  const closeFormDialog = useCallback(() => {
    setFormDialogOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
    setFormErrors({});
    setShowPassword(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    const isEditing = editingUser !== null;
    if (!validateForm(isEditing)) return;

    try {
      setSubmitting(true);

      if (isEditing) {
        const body: Record<string, unknown> = {
          id: editingUser.id,
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          isActive: editingUser.isActive,
        };
        if (form.password.trim()) {
          body.password = form.password;
        }

        const res = await fetch('/api/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || 'Failed to update user');
        }
        toast({
          title: 'User updated',
          description: `${form.name.trim()} has been updated successfully.`,
        });
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            role: form.role,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || 'Failed to create user');
        }
        toast({
          title: 'User created',
          description: `${form.name.trim()} has been added to Liafon Stock Management.`,
        });
      }

      closeFormDialog();
      fetchUsers();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }, [form, editingUser, validateForm, closeFormDialog, fetchUsers, toast]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const openDeleteDialog = useCallback((user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!userToDelete) return;

    try {
      setDeleting(true);
      const res = await fetch(`/api/users?id=${userToDelete.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete user');
      toast({
        title: 'User deleted',
        description: `${userToDelete.name} has been removed from the system.`,
      });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      fetchUsers();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete user',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }, [userToDelete, fetchUsers, toast]);

  // ── Toggle Active ─────────────────────────────────────────────────────────

  const performToggleActive = useCallback(
    async (user: User) => {
      setTogglingId(user.id);
      try {
        // Only send the fields we're actually changing — sending the full
        // user object would overwrite concurrent changes by another admin.
        const res = await fetch('/api/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: user.id,
            isActive: !user.isActive,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update user status');
        }
        toast({
          title: user.isActive ? 'User deactivated' : 'User activated',
          description: `${user.name} is now ${user.isActive ? 'inactive' : 'active'}.`,
        });
        fetchUsers();
      } catch (err) {
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'Failed to update user status',
          variant: 'destructive',
        });
      } finally {
        setTogglingId(null);
      }
    },
    [fetchUsers, toast]
  );

  const handleToggleActive = useCallback(
    (user: User) => {
      // Activating is safe — no confirm needed.
      if (!user.isActive) {
        void performToggleActive(user);
        return;
      }
      // Deactivating is destructive — confirm first.
      setDeactivateTarget(user);
    },
    [performToggleActive]
  );

  const confirmDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;
    await performToggleActive(deactivateTarget);
    setDeactivateTarget(null);
  }, [deactivateTarget, performToggleActive]);

  // ── Filtering ────────────────────────────────────────────────────────────

  const filteredUsers = users.filter((user) => {
    const q = searchQuery.toLowerCase();
    return (
      user.name.toLowerCase().includes(q) ||
      user.email.toLowerCase().includes(q) ||
      user.role.toLowerCase().includes(q)
    );
  });

  // ── KPI Calculations ─────────────────────────────────────────────────────

  const activeUsersCount = users.filter((u) => u.isActive).length;
  const ownerCount = users.filter((u) => u.role === 'owner').length;
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const managerCount = users.filter((u) => u.role === 'manager').length;
  const regularUserCount = users.filter((u) => u.role === 'user').length;

  // ── Loading State ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-0">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-6 w-8" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <TableSkeleton />
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
              Failed to load users
            </p>
            <p className="text-sm text-rose-500 dark:text-rose-400">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchUsers} className="ml-auto gap-1.5">
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <motion.div
        className="space-y-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              User Management
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create and manage user accounts. Only the owner can access this page.
            </p>
          </div>
          <Button onClick={openAddDialog} className="gap-2 self-start">
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        </motion.div>

        {/* KPI Cards */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <Card>
            <CardContent className="pt-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60">
                  <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Active Users</p>
                  <p className="text-2xl font-bold text-foreground">{activeUsersCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-950/60">
                  <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Owners</p>
                  <p className="text-2xl font-bold text-foreground">{ownerCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950/60">
                  <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Admins</p>
                  <p className="text-2xl font-bold text-foreground">{adminCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60">
                  <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Managers</p>
                  <p className="text-2xl font-bold text-foreground">{managerCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Users Table */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="p-0">
              {/* Table Header Bar */}
              <div className="p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>
                    {users.length} user{users.length !== 1 ? 's' : ''} total &middot; {activeUsersCount} active
                  </span>
                </div>
                {users.length > 0 && (
                  <div className="relative max-w-xs w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Empty / No Results / Table */}
              {filteredUsers.length === 0 && !searchQuery ? (
                <EmptyState onAdd={openAddDialog} />
              ) : filteredUsers.length === 0 && searchQuery ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Search className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm">No users match &quot;{searchQuery}&quot;</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id} asChild>
                          <motion.tr
                            variants={rowVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            layout
                          >
                            <TableCell className="pl-6">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center h-9 w-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 text-blue-700 dark:text-blue-300 text-sm font-semibold flex-shrink-0">
                                  {user.name
                                    .split(' ')
                                    .map((n) => n.charAt(0).toUpperCase())
                                    .slice(0, 2)
                                    .join('')}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate max-w-[180px]">
                                    {user.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Joined {format(new Date(user.createdAt), 'MMM d, yyyy')}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                                  {user.email}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <RoleBadge role={user.role} />
                            </TableCell>
                            <TableCell>
                              <StatusBadge isActive={user.isActive} />
                            </TableCell>
                            <TableCell>
                              {user.lastLogin ? (
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-xs text-muted-foreground cursor-default">
                                        {formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true })}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom">
                                      {format(new Date(user.lastLogin), 'PPpp')}
                                    </TooltipContent>
                                  </Tooltip>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Never</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right pr-6">
                              <div className="flex items-center justify-end gap-1.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openEditDialog(user)}
                                      className="h-8 w-8 p-0"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">Edit user</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleToggleActive(user)}
                                      disabled={togglingId === user.id}
                                      aria-label={user.isActive ? 'Deactivate user' : 'Activate user'}
                                      className={`h-8 w-8 p-0 ${
                                        user.isActive
                                          ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800'
                                          : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/50'
                                      }`}
                                    >
                                      {togglingId === user.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : user.isActive ? (
                                        <UserX className="h-3.5 w-3.5" />
                                      ) : (
                                        <UserCheck className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    {user.isActive ? 'Deactivate user' : 'Activate user'}
                                  </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openDeleteDialog(user)}
                                      className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:text-rose-300 dark:hover:bg-rose-950/50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">Delete user</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </motion.tr>
                        </TableRow>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              )}

              {/* Footer */}
              {filteredUsers.length > 0 && (
                <>
                  <Separator />
                  <div className="px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Showing {filteredUsers.length} of {users.length} users
                    </span>
                    <span>
                      {regularUserCount} standard user{regularUserCount !== 1 ? 's' : ''} &middot;{' '}
                      {managerCount} manager{managerCount !== 1 ? 's' : ''} &middot;{' '}
                      {adminCount} admin{adminCount !== 1 ? 's' : ''} &middot;{' '}
                      {ownerCount} owner{ownerCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Role Permissions Reference */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Role Permissions Reference</CardTitle>
              <CardDescription>
                Overview of what each role can access in Liafon Stock Management.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ROLE_OPTIONS.map((roleOpt) => {
                  const info = ROLE_PERMISSIONS[roleOpt.value];
                  const IconComponent = info.icon;
                  return (
                    <div key={roleOpt.value} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <RoleBadge role={roleOpt.value} />
                        <span className="text-xs text-muted-foreground">
                          &mdash; {roleOpt.description}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {info.permissions.map((perm) => {
                          const PermIcon = ROLE_PERMISSION_ICONS[perm];
                          return (
                            <Badge
                              key={perm}
                              variant="secondary"
                              className="text-[11px] gap-1 font-normal"
                            >
                              {PermIcon && <PermIcon className="h-3 w-3" />}
                              {perm}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Add/Edit User Dialog */}
      <Dialog open={formDialogOpen} onOpenChange={(open) => !open && closeFormDialog()}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? `Update ${editingUser.name}'s account details.`
                : 'Fill in the details to create a new user account for Liafon Stock Management.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="user-name">
                Full Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="user-name"
                placeholder="e.g. John Doe"
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

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="user-email">
                Email Address <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="user-email"
                type="email"
                placeholder="e.g. john@liafon.com"
                value={form.email}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, email: e.target.value }));
                  if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: undefined }));
                }}
                className={formErrors.email ? 'border-rose-300 dark:border-rose-700' : ''}
              />
              {formErrors.email && (
                <p className="text-xs text-rose-500">{formErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="user-password">
                Password {editingUser ? '' : <span className="text-rose-500">*</span>}
              </Label>
              <div className="relative">
                <Input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={editingUser ? 'Leave blank to keep current password' : 'Minimum 6 characters'}
                  value={form.password}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, password: e.target.value }));
                    if (formErrors.password) setFormErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  className={`pr-10 ${formErrors.password ? 'border-rose-300 dark:border-rose-700' : ''}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {formErrors.password && (
                <p className="text-xs text-rose-500">{formErrors.password}</p>
              )}
              {editingUser && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Leave blank to keep the current password unchanged.
                </p>
              )}
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label htmlFor="user-role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, role: value as UserRole }))
                }
              >
                <SelectTrigger id="user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <span>{opt.label}</span>
                        <span className="text-muted-foreground text-xs">— {opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role Permissions Preview */}
            <RolePermissionsInfo role={form.role} />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={closeFormDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingUser ? 'Update User' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">{userToDelete?.name}</span>? This
              action cannot be undone. The user will be permanently removed from Liafon Stock
              Management.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600 text-white gap-2"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open && togglingId === null) setDeactivateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deactivateTarget?.name}</strong> will no longer be able
              to sign in. Their historical activity log entries are preserved.
              You can reactivate the account at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={togglingId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDeactivate();
              }}
              disabled={togglingId !== null}
              className="bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-600 text-white gap-2"
            >
              {togglingId !== null && <Loader2 className="h-4 w-4 animate-spin" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
