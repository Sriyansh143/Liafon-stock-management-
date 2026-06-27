'use client'

import { Lock, AlertTriangle, Clock } from 'lucide-react'
import { motion } from 'framer-motion'

interface LicenseLockScreenProps {
  message: string
  trial?: boolean
  expired?: boolean
  daysRemaining?: number
}

export function LicenseLockScreen({ message, trial, expired, daysRemaining }: LicenseLockScreenProps) {
  const isTrialWarning = trial && !expired && daysRemaining !== undefined && daysRemaining <= 7

  // If trial is still active with > 7 days, don't show lock screen
  // (just show a small banner). Only lock when expired or deactivated.
  if (trial && !expired && daysRemaining !== undefined && daysRemaining > 0) {
    // Show a warning banner but don't block access
    if (daysRemaining > 7) return null
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="bg-card border border-border rounded-xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className={`px-6 py-8 text-center ${expired ? 'bg-rose-600' : 'bg-amber-500'}`}>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-3"
            >
              {expired ? (
                <Lock className="w-8 h-8 text-white" />
              ) : (
                <Clock className="w-8 h-8 text-white" />
              )}
            </motion.div>
            <h1 className="text-xl font-bold text-white">
              {expired ? 'Access Locked' : 'Trial Ending Soon'}
            </h1>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground text-center">{message}</p>

            {trial && !expired && daysRemaining !== undefined && daysRemaining > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                  {daysRemaining}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  day{daysRemaining !== 1 ? 's' : ''} remaining in trial
                </p>
              </div>
            )}

            {expired && (
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-700 dark:text-rose-300">
                    <p className="font-semibold mb-1">Access has been locked</p>
                    <p>
                      This installation has been deactivated or the license has expired.
                      Please contact your developer/service provider to restore access.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="text-center pt-2">
              <p className="text-[11px] text-muted-foreground">
                Liafon Stock Management · Contact your developer for activation
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
