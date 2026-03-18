/**
 * Shared Jobs filter constants and metadata.
 *
 * This file intentionally centralizes:
 * - the missing-value sentinel
 * - the canonical filter field list and ordering
 * - which categorical filters are visible in the Jobs filter bar
 * - which filters are enum-backed vs server-backed
 * - which filters support missing-value selection
 * - which filters should enable local option search in later UX work
 */

import { JOB_PRIORITY, JOB_STATUS, PIPELINE_HEALTH } from './status-config'

export const JOB_FILTER_MISSING_VALUE = '__MISSING__' as const

export interface JobFilterOption {
  value: string
  label: string
  isMissing: boolean
}

function compareJobFilterValues(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    sensitivity: 'base',
    numeric: true,
  })
}

function buildEnumOptions(config: Record<string, { label: string }>): JobFilterOption[] {
  return Object.entries(config).map(([value, entry]) => ({
    value,
    label: entry.label,
    isMissing: false,
  }))
}

export const JOB_FILTER_DEFINITIONS = [
  {
    field: 'status',
    optionSource: 'enum',
    triggerLabel: 'Status',
    allLabel: 'All Status',
    ariaLabel: 'Filter by status',
    widthClassName: 'w-40',
    showInFilterBar: true,
    supportsMissing: false,
    enableLocalSearch: false,
    options: buildEnumOptions(JOB_STATUS),
  },
  {
    field: 'priority',
    optionSource: 'enum',
    triggerLabel: 'Priority',
    allLabel: 'All Jobs',
    ariaLabel: 'Filter by priority',
    widthClassName: 'w-32',
    showInFilterBar: true,
    supportsMissing: false,
    enableLocalSearch: false,
    options: buildEnumOptions(JOB_PRIORITY),
  },
  {
    field: 'pipelineHealth',
    optionSource: 'enum',
    triggerLabel: 'Pipeline',
    allLabel: 'All Pipelines',
    ariaLabel: 'Filter by pipeline health',
    widthClassName: 'w-36',
    showInFilterBar: true,
    supportsMissing: false,
    enableLocalSearch: false,
    options: buildEnumOptions(PIPELINE_HEALTH),
  },
  {
    field: 'department',
    optionSource: 'server',
    triggerLabel: 'All Departments',
    allLabel: 'All Departments',
    ariaLabel: 'Filter by department',
    widthClassName: 'w-44',
    showInFilterBar: true,
    supportsMissing: false,
    enableLocalSearch: true,
  },
  {
    field: 'employeeType',
    optionSource: 'server',
    triggerLabel: 'All Employee Types',
    allLabel: 'All Employee Types',
    ariaLabel: 'Filter by employee type',
    widthClassName: 'w-44',
    showInFilterBar: true,
    supportsMissing: false,
    enableLocalSearch: false,
  },
  {
    field: 'location',
    optionSource: 'server',
    triggerLabel: 'All Locations',
    allLabel: 'All Locations',
    ariaLabel: 'Filter by location',
    widthClassName: 'w-44',
    showInFilterBar: true,
    supportsMissing: true,
    enableLocalSearch: true,
  },
  {
    field: 'recruiterOwner',
    optionSource: 'server',
    triggerLabel: 'All Recruiters',
    allLabel: 'All Recruiters',
    ariaLabel: 'Filter by recruiter',
    widthClassName: 'w-44',
    showInFilterBar: true,
    supportsMissing: true,
    enableLocalSearch: true,
  },
  {
    field: 'functionalPriority',
    optionSource: 'server',
    triggerLabel: 'All Func. Priority',
    allLabel: 'All Func. Priority',
    ariaLabel: 'Filter by functional priority',
    widthClassName: 'w-44',
    showInFilterBar: true,
    supportsMissing: true,
    enableLocalSearch: false,
  },
  {
    field: 'corporatePriority',
    optionSource: 'server',
    triggerLabel: 'All Corp. Priority',
    allLabel: 'All Corp. Priority',
    ariaLabel: 'Filter by corporate priority',
    widthClassName: 'w-44',
    showInFilterBar: true,
    supportsMissing: true,
    enableLocalSearch: false,
  },
  {
    field: 'function',
    optionSource: 'server',
    triggerLabel: 'All Functions',
    allLabel: 'All Functions',
    ariaLabel: 'Filter by function',
    widthClassName: 'w-44',
    showInFilterBar: false,
    supportsMissing: false,
    enableLocalSearch: false,
  },
  {
    field: 'level',
    optionSource: 'server',
    triggerLabel: 'All Levels',
    allLabel: 'All Levels',
    ariaLabel: 'Filter by level',
    widthClassName: 'w-32',
    showInFilterBar: false,
    supportsMissing: false,
    enableLocalSearch: false,
  },
  {
    field: 'horizon',
    optionSource: 'server',
    triggerLabel: 'All Horizons',
    allLabel: 'All Horizons',
    ariaLabel: 'Filter by horizon',
    widthClassName: 'w-36',
    showInFilterBar: false,
    supportsMissing: false,
    enableLocalSearch: false,
  },
  {
    field: 'asset',
    optionSource: 'server',
    triggerLabel: 'All Assets',
    allLabel: 'All Assets',
    ariaLabel: 'Filter by asset',
    widthClassName: 'w-36',
    showInFilterBar: false,
    supportsMissing: false,
    enableLocalSearch: false,
  },
] as const

export type JobFilterDefinition = (typeof JOB_FILTER_DEFINITIONS)[number]
export type JobFilterField = JobFilterDefinition['field']
export type JobEnumField = Extract<JobFilterDefinition, { optionSource: 'enum' }>['field']
export type JobServerFilterField = Extract<JobFilterDefinition, { optionSource: 'server' }>['field']
export type JobVisibleFilterField = Extract<JobFilterDefinition, { showInFilterBar: true }>['field']
export type JobVisibleEnumFilterField = Extract<
  Extract<JobFilterDefinition, { showInFilterBar: true }>,
  { optionSource: 'enum' }
>['field']
export type JobVisibleServerFilterField = Extract<
  Extract<JobFilterDefinition, { showInFilterBar: true }>,
  { optionSource: 'server' }
>['field']

export type JobsFilterOptionsResponse = {
  missingValue: typeof JOB_FILTER_MISSING_VALUE
  options: Record<JobServerFilterField, JobFilterOption[]>
}

export const JOB_FILTER_FIELDS = JOB_FILTER_DEFINITIONS.map(
  (definition) => definition.field,
) as JobFilterField[]

export const JOB_FILTER_DEFINITION_BY_FIELD = Object.fromEntries(
  JOB_FILTER_DEFINITIONS.map((definition) => [definition.field, definition]),
) as Record<JobFilterField, JobFilterDefinition>

export const JOB_SERVER_FILTER_DEFINITIONS = JOB_FILTER_DEFINITIONS.filter(
  (definition): definition is Extract<JobFilterDefinition, { optionSource: 'server' }> =>
    definition.optionSource === 'server',
) as Array<Extract<JobFilterDefinition, { optionSource: 'server' }>>

export const JOB_SERVER_FILTER_FIELDS = JOB_SERVER_FILTER_DEFINITIONS.map(
  (definition) => definition.field,
) as JobServerFilterField[]

export const JOB_VISIBLE_FILTER_DEFINITIONS = JOB_FILTER_DEFINITIONS.filter(
  (definition): definition is Extract<JobFilterDefinition, { showInFilterBar: true }> =>
    definition.showInFilterBar,
) as Array<Extract<JobFilterDefinition, { showInFilterBar: true }>>

export const JOB_VISIBLE_FILTER_FIELDS = JOB_VISIBLE_FILTER_DEFINITIONS.map(
  (definition) => definition.field,
) as JobVisibleFilterField[]

export const JOB_VISIBLE_ENUM_FILTER_DEFINITIONS = JOB_FILTER_DEFINITIONS.filter(
  (
    definition,
  ): definition is Extract<JobFilterDefinition, { optionSource: 'enum'; showInFilterBar: true }> =>
    definition.optionSource === 'enum' && definition.showInFilterBar,
) as Array<Extract<JobFilterDefinition, { optionSource: 'enum'; showInFilterBar: true }>>

export const JOB_VISIBLE_SERVER_FILTER_DEFINITIONS = JOB_FILTER_DEFINITIONS.filter(
  (
    definition,
  ): definition is Extract<JobFilterDefinition, { optionSource: 'server'; showInFilterBar: true }> =>
    definition.optionSource === 'server' && definition.showInFilterBar,
) as Array<Extract<JobFilterDefinition, { optionSource: 'server'; showInFilterBar: true }>>

export const JOB_MISSING_SUPPORTED_FIELDS = JOB_SERVER_FILTER_DEFINITIONS.filter(
  (definition) => definition.supportsMissing,
).map((definition) => definition.field) as JobServerFilterField[]

export function sortJobFilterSelectionValues(
  values: string[],
  options: JobFilterOption[],
  missingValue: string = JOB_FILTER_MISSING_VALUE,
): string[] {
  const optionOrder = new Map(options.map((option, index) => [option.value, index]))

  return [...new Set(values)]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((left, right) => {
      const leftIsMissing = left === missingValue
      const rightIsMissing = right === missingValue

      if (leftIsMissing !== rightIsMissing) {
        return leftIsMissing ? 1 : -1
      }

      const leftOrder = optionOrder.get(left)
      const rightOrder = optionOrder.get(right)

      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder
      }

      if (leftOrder !== undefined) {
        return -1
      }

      if (rightOrder !== undefined) {
        return 1
      }

      return compareJobFilterValues(left, right)
    })
}
