/**
 * Liafon Software Suite — 5-App Bundle Configuration
 *
 * This data defines the 5 apps in the Liafon platform bundle.
 * Used by the 3D landing page and the in-app "upgrade" section.
 */

export interface AppBundle {
  id: string
  name: string
  tagline: string
  description: string
  icon: string
  color: string
  url: string
  isMainProduct: boolean
  status: 'live' | 'coming-soon'
}

export const APP_BUNDLE: AppBundle[] = [
  {
    id: 'stock-management',
    name: 'Stock Management',
    tagline: 'Auto spare parts shop system',
    description: 'Inventory, sales, purchases, multi-currency, WhatsApp alerts, invoice printing, PWA. Built for auto parts shops, hardware stores, and general inventory businesses.',
    icon: 'Package',
    color: '#10b981',
    url: 'https://liafon-stock-management-6bhl35q1k-hrliafon-1935s-projects.vercel.app/',
    isMainProduct: true,
    status: 'live',
  },
  {
    id: 'billing',
    name: 'Billing & Invoicing',
    tagline: 'GST invoices + payment tracking',
    description: 'Professional invoice generation with GST calculation, payment tracking, customer management, and expense recording. Perfect for consultants, freelancers, and small businesses.',
    icon: 'FileText',
    color: '#06b6d4',
    url: '#',
    isMainProduct: false,
    status: 'coming-soon',
  },
  {
    id: 'hr',
    name: 'HR Management',
    tagline: 'Employees, attendance, payroll',
    description: 'Employee records, attendance tracking, leave management, payroll processing, and performance reviews. Everything a growing business needs to manage its team.',
    icon: 'Users',
    color: '#f59e0b',
    url: '#',
    isMainProduct: false,
    status: 'coming-soon',
  },
  {
    id: 'school',
    name: 'School Management',
    tagline: 'Students, fees, grades, attendance',
    description: 'Student admissions, fee collection, grade management, attendance tracking, timetable generation, and parent portal. Designed for schools and coaching centers.',
    icon: 'GraduationCap',
    color: '#8b5cf6',
    url: '#',
    isMainProduct: false,
    status: 'coming-soon',
  },
  {
    id: 'clinic',
    name: 'Clinic Management',
    tagline: 'Patients, appointments, pharmacy',
    description: 'Patient records, appointment scheduling, prescription management, pharmacy inventory, and billing. Ideal for clinics, pharmacies, and diagnostic centers.',
    icon: 'Stethoscope',
    color: '#ef4444',
    url: '#',
    isMainProduct: false,
    status: 'coming-soon',
  },
]

export const PRICING_PLANS = [
  {
    id: 'free' as const,
    name: 'Free Trial',
    price: 0,
    period: '7 days',
    description: 'Try any 1 app free',
    features: [
      '1 app of your choice',
      '50 parts / 100 sales per month',
      '50 customers, 20 suppliers',
      'Basic dashboard',
      'Mobile PWA access',
    ],
    limits: ['No exports', 'No imports', 'Watermarked invoices', '1 user only'],
    cta: 'Start Free Trial',
    highlight: false,
    color: '#64748b',
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    price: 999,
    period: 'per month',
    description: 'All 5 apps + unlimited',
    features: [
      'All 5 apps included',
      'Unlimited parts, sales, customers',
      'CSV/Excel import & export',
      'No watermark on invoices',
      'Up to 5 users',
      'WhatsApp integration',
      '5GB cloud storage',
      'Priority email support',
    ],
    limits: [],
    cta: 'Upgrade to Pro',
    highlight: true,
    color: '#10b981',
  },
  {
    id: 'business' as const,
    name: 'Business',
    price: 2999,
    period: 'per month',
    description: 'Pro + API + more users',
    features: [
      'Everything in Pro',
      'Up to 10 users',
      'API access (build integrations)',
      '50GB cloud storage',
      'Advanced analytics',
      'Custom branding',
      'Phone support',
      'Member directory listing',
    ],
    limits: [],
    cta: 'Upgrade to Business',
    highlight: false,
    color: '#06b6d4',
  },
  {
    id: 'lifetime' as const,
    name: 'Lifetime',
    price: 9999,
    period: 'one-time',
    description: 'Pay once, use forever',
    features: [
      'All 5 apps forever',
      'Unlimited everything',
      'Unlimited users',
      'API access',
      '10GB cloud storage',
      'Member directory listing',
      'Lifetime updates',
      'No monthly fees',
    ],
    limits: [],
    cta: 'Buy Lifetime',
    highlight: false,
    color: '#f59e0b',
  },
]
