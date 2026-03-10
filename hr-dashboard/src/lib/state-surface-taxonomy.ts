/**
 * STATE SURFACE TAXONOMY
 * ======================
 * Guidelines for how the product communicates across empty, loading, error,
 * unauthorized, and not-found scenarios.
 *
 * DESIGN PRINCIPLES
 * -----------------
 * 1. **Respectful of time** - Never waste the user's attention
 * 2. **Actionable when possible** - Always offer a clear next step
 * 3. **Contextually appropriate** - Match tone to severity
 * 4. **Honest about what happened** - Don't obscure technical reality
 * 5. **Visually consistent** - Same treatment across the product
 */

import type { LucideIcon } from 'lucide-react'
import {
  Inbox,
  FileQuestion,
  AlertCircle,
  AlertTriangle,
  Lock,
  ShieldX,
  Wifi,
  WifiOff,
  RefreshCw,
  Plus,
  Home,
  ArrowLeft,
  Search,
  HelpCircle,
} from 'lucide-react'

// ============================================================================
// STATE TYPE DEFINITIONS
// ============================================================================

export type StateType =
  | 'empty'           // No data exists (normal state, not an error)
  | 'empty-filtered'  // No results match current filters
  | 'empty-search'    // No results match search query
  | 'loading'         // Data is being fetched
  | 'error-network'   // Network/connectivity failure
  | 'error-server'    // Server returned an error (5xx)
  | 'error-client'    // Client-side error (4xx, validation)
  | 'error-unknown'   // Unexpected error
  | 'unauthorized'    // User lacks permission
  | 'unauthenticated' // User not logged in
  | 'not-found'       // Resource doesn't exist
  | 'offline'         // Browser is offline

export type ActionType =
  | 'retry'           // Try the operation again
  | 'create'          // Create a new resource
  | 'navigate-home'   // Go to dashboard/home
  | 'navigate-back'   // Go back in history
  | 'login'           // Redirect to login
  | 'clear-filters'   // Reset filters/search
  | 'contact-support' // Open support channel
  | 'refresh'         // Refresh the page

// ============================================================================
// STATE CONFIGURATIONS
// ============================================================================

export interface StateConfig {
  type: StateType
  icon: LucideIcon
  iconStyle: 'neutral' | 'warning' | 'danger' | 'info'
  title: string
  description: string
  tone: 'friendly' | 'apologetic' | 'informative' | 'serious'
  primaryAction?: ActionType
  secondaryAction?: ActionType
  showTechnicalDetails: boolean
}

export const STATE_CONFIGS: Record<StateType, StateConfig> = {
  // Empty states - friendly, encouraging
  empty: {
    type: 'empty',
    icon: Inbox,
    iconStyle: 'neutral',
    title: 'Nothing here yet',
    description: 'This is where {resource} will appear once you add them.',
    tone: 'friendly',
    primaryAction: 'create',
    showTechnicalDetails: false,
  },

  'empty-filtered': {
    type: 'empty-filtered',
    icon: Search,
    iconStyle: 'neutral',
    title: 'No matches found',
    description: 'No {resource} match your current filters. Try adjusting or clearing them.',
    tone: 'informative',
    primaryAction: 'clear-filters',
    showTechnicalDetails: false,
  },

  'empty-search': {
    type: 'empty-search',
    icon: Search,
    iconStyle: 'neutral',
    title: 'No results for "{query}"',
    description: 'We couldn\'t find any {resource} matching your search. Try different keywords.',
    tone: 'informative',
    primaryAction: 'clear-filters',
    showTechnicalDetails: false,
  },

  // Loading states - minimal, unobtrusive
  loading: {
    type: 'loading',
    icon: RefreshCw,
    iconStyle: 'info',
    title: 'Loading...',
    description: '', // Loading states typically don't need description
    tone: 'informative',
    showTechnicalDetails: false,
  },

  // Error states - apologetic but actionable
  'error-network': {
    type: 'error-network',
    icon: WifiOff,
    iconStyle: 'warning',
    title: 'Connection problem',
    description: 'We couldn\'t reach the server. Check your internet connection and try again.',
    tone: 'apologetic',
    primaryAction: 'retry',
    secondaryAction: 'navigate-home',
    showTechnicalDetails: true,
  },

  'error-server': {
    type: 'error-server',
    icon: AlertCircle,
    iconStyle: 'danger',
    title: 'Something went wrong',
    description: 'We encountered a problem on our end. Please try again in a moment.',
    tone: 'apologetic',
    primaryAction: 'retry',
    secondaryAction: 'navigate-home',
    showTechnicalDetails: true,
  },

  'error-client': {
    type: 'error-client',
    icon: AlertTriangle,
    iconStyle: 'warning',
    title: 'Request couldn\'t be processed',
    description: 'There was a problem with the request. Please check and try again.',
    tone: 'informative',
    primaryAction: 'retry',
    secondaryAction: 'navigate-back',
    showTechnicalDetails: true,
  },

  'error-unknown': {
    type: 'error-unknown',
    icon: AlertCircle,
    iconStyle: 'danger',
    title: 'Unexpected error',
    description: 'Something unexpected happened. If this keeps happening, contact support.',
    tone: 'apologetic',
    primaryAction: 'retry',
    secondaryAction: 'contact-support',
    showTechnicalDetails: true,
  },

  // Auth states - informative, clear path forward
  unauthorized: {
    type: 'unauthorized',
    icon: Lock,
    iconStyle: 'warning',
    title: 'Access denied',
    description: 'You don\'t have permission to view this page. Contact your administrator if you need access.',
    tone: 'informative',
    primaryAction: 'navigate-home',
    showTechnicalDetails: false,
  },

  unauthenticated: {
    type: 'unauthenticated',
    icon: ShieldX,
    iconStyle: 'info',
    title: 'Sign in required',
    description: 'Please sign in to access this page.',
    tone: 'informative',
    primaryAction: 'login',
    showTechnicalDetails: false,
  },

  // Not found - friendly, helpful
  'not-found': {
    type: 'not-found',
    icon: FileQuestion,
    iconStyle: 'neutral',
    title: 'Page not found',
    description: 'The page you\'re looking for doesn\'t exist or has been moved.',
    tone: 'friendly',
    primaryAction: 'navigate-home',
    secondaryAction: 'navigate-back',
    showTechnicalDetails: false,
  },

  // Offline - informative, patient
  offline: {
    type: 'offline',
    icon: Wifi,
    iconStyle: 'warning',
    title: 'You\'re offline',
    description: 'Some features may be unavailable until you reconnect.',
    tone: 'informative',
    primaryAction: 'refresh',
    showTechnicalDetails: false,
  },
}

// ============================================================================
// ACTION CONFIGURATIONS
// ============================================================================

export interface ActionConfig {
  type: ActionType
  label: string
  icon: LucideIcon
  variant: 'default' | 'outline' | 'ghost' | 'destructive'
}

export const ACTION_CONFIGS: Record<ActionType, ActionConfig> = {
  retry: {
    type: 'retry',
    label: 'Try again',
    icon: RefreshCw,
    variant: 'default',
  },
  create: {
    type: 'create',
    label: 'Create {resource}',
    icon: Plus,
    variant: 'default',
  },
  'navigate-home': {
    type: 'navigate-home',
    label: 'Go to dashboard',
    icon: Home,
    variant: 'outline',
  },
  'navigate-back': {
    type: 'navigate-back',
    label: 'Go back',
    icon: ArrowLeft,
    variant: 'outline',
  },
  login: {
    type: 'login',
    label: 'Sign in',
    icon: Lock,
    variant: 'default',
  },
  'clear-filters': {
    type: 'clear-filters',
    label: 'Clear filters',
    icon: Search,
    variant: 'outline',
  },
  'contact-support': {
    type: 'contact-support',
    label: 'Contact support',
    icon: HelpCircle,
    variant: 'outline',
  },
  refresh: {
    type: 'refresh',
    label: 'Refresh page',
    icon: RefreshCw,
    variant: 'outline',
  },
}

// ============================================================================
// ICON STYLE MAPPINGS
// ============================================================================

export const ICON_STYLE_CLASSES: Record<StateConfig['iconStyle'], {
  container: string
  icon: string
}> = {
  neutral: {
    container: 'bg-muted',
    icon: 'text-muted-foreground',
  },
  info: {
    container: 'bg-blue-50 dark:bg-blue-950/50',
    icon: 'text-blue-500 dark:text-blue-400',
  },
  warning: {
    container: 'bg-amber-50 dark:bg-amber-950/50',
    icon: 'text-amber-500 dark:text-amber-400',
  },
  danger: {
    container: 'bg-red-50 dark:bg-red-950/50',
    icon: 'text-red-500 dark:text-red-400',
  },
}

// ============================================================================
// COPY GUIDELINES
// ============================================================================

/**
 * COPY TONE BY STATE TYPE
 *
 * Empty states:
 * - Friendly, encouraging, optimistic
 * - Focus on what CAN be done, not what's missing
 * - Use "you" to make it personal
 * - Example: "Nothing here yet" vs "No data found"
 *
 * Error states:
 * - Apologetic when it's our fault (server errors)
 * - Informative when it's fixable (network, client errors)
 * - Always suggest a next step
 * - Don't blame the user
 *
 * Auth states:
 * - Informative, not accusatory
 * - Clear path forward
 * - Don't over-explain permissions
 *
 * Not found:
 * - Friendly, not alarming
 * - Acknowledge the user's intent
 * - Offer helpful alternatives
 */

/**
 * WHEN TO SHOW TECHNICAL DETAILS
 *
 * Show details when:
 * - Error is recoverable (network, server)
 * - User might need to report the issue
 * - Details would help debugging
 *
 * Hide details when:
 * - State is normal (empty, not-found)
 * - Details would confuse non-technical users
 * - Security-sensitive information would be exposed
 *
 * Format for technical details:
 * - Use monospace font
 * - Keep it compact (error ID, status code)
 * - Place below main content, de-emphasized
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get state configuration by type
 */
export function getStateConfig(type: StateType): StateConfig {
  return STATE_CONFIGS[type]
}

/**
 * Get action configuration by type
 */
export function getActionConfig(type: ActionType): ActionConfig {
  return ACTION_CONFIGS[type]
}

/**
 * Interpolate resource name into copy
 */
export function interpolateCopy(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`)
}

/**
 * Determine state type from error
 */
export function getStateTypeFromError(error: Error & { status?: number; code?: string }): StateType {
  // Network errors
  if (error.message.includes('fetch') || error.message.includes('network') || error.code === 'NETWORK_ERROR') {
    return 'error-network'
  }

  // HTTP status-based
  if (error.status) {
    if (error.status === 401) return 'unauthenticated'
    if (error.status === 403) return 'unauthorized'
    if (error.status === 404) return 'not-found'
    if (error.status >= 500) return 'error-server'
    if (error.status >= 400) return 'error-client'
  }

  return 'error-unknown'
}

/**
 * Determine empty state type from context
 */
export function getEmptyStateType(context: {
  hasFilters?: boolean
  hasSearch?: boolean
  searchQuery?: string
}): StateType {
  if (context.hasSearch && context.searchQuery) {
    return 'empty-search'
  }
  if (context.hasFilters) {
    return 'empty-filtered'
  }
  return 'empty'
}
