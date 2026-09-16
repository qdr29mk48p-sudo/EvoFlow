import { describe, expect, it } from 'vitest'
import {
  buildDeveloperTaskSummary,
  developerTaskCanCancel,
  developerTaskIsInFlight,
  developerTaskStatusLabel,
  isValidEvoId,
  parseCriteriaListInput,
  parsePathListInput,
} from '../src/lib/developer-tasks.js'

describe('developer-tasks helpers', () => {
  it('validates EVO ids', () => {
    expect(isValidEvoId('EVO-0006')).toBe(true)
    expect(isValidEvoId('EVO-0006.4')).toBe(true)
    expect(isValidEvoId('EVO-6')).toBe(false)
    expect(isValidEvoId('evo-0006')).toBe(false)
    expect(isValidEvoId('')).toBe(false)
  })

  it('parses path and criteria lists', () => {
    expect(parsePathListInput('evopanel/src\n docs/tasks, evopanel/src')).toEqual([
      'evopanel/src',
      'docs/tasks',
    ])
    expect(parseCriteriaListInput('- 有单元测试\n* 界面声明只读\n\n')).toEqual([
      '有单元测试',
      '界面声明只读',
    ])
  })

  it('builds a short summary from instructions', () => {
    expect(buildDeveloperTaskSummary('第一行\n第二行')).toBe('第一行')
    expect(buildDeveloperTaskSummary('')).toBe('Cursor 只读计划任务')
    expect(buildDeveloperTaskSummary('x'.repeat(600)).length).toBe(500)
  })

  it('maps statuses to Chinese labels and in-flight flags', () => {
    expect(developerTaskStatusLabel('queued')).toBe('排队中')
    expect(developerTaskStatusLabel('awaiting_approval')).toBe('计划已就绪')
    expect(developerTaskStatusLabel('preflight_failed')).toBe('预检失败')
    expect(developerTaskIsInFlight('draft')).toBe(true)
    expect(developerTaskIsInFlight('routing_complete')).toBe(true)
    expect(developerTaskIsInFlight('queued')).toBe(true)
    expect(developerTaskIsInFlight('planning')).toBe(true)
    expect(developerTaskIsInFlight('awaiting_approval')).toBe(false)
    expect(developerTaskIsInFlight('failed')).toBe(false)
    expect(developerTaskIsInFlight('cancelled')).toBe(false)
  })

  it('only allows cancel for queued / preflight_failed / awaiting_approval', () => {
    expect(developerTaskCanCancel({ status: 'queued' })).toBe(true)
    expect(developerTaskCanCancel({ status: 'preflight_failed' })).toBe(true)
    expect(developerTaskCanCancel({ status: 'awaiting_approval' })).toBe(true)
    expect(developerTaskCanCancel({ status: 'queued', can_cancel: true })).toBe(true)
    expect(developerTaskCanCancel({ status: 'queued', can_cancel: false })).toBe(false)
    expect(developerTaskCanCancel({ status: 'awaiting_approval', can_cancel: false })).toBe(false)

    // Non-cancelable statuses never expand even if a future payload sets can_cancel:true
    for (const status of [
      'planning',
      'draft',
      'routing_complete',
      'failed',
      'cancelled',
      'unknown',
      'something_else',
    ]) {
      expect(developerTaskCanCancel({ status })).toBe(false)
      expect(developerTaskCanCancel({ status, can_cancel: true })).toBe(false)
    }

    expect(developerTaskCanCancel(null)).toBe(false)
    expect(developerTaskCanCancel(undefined)).toBe(false)
    expect(developerTaskCanCancel({})).toBe(false)
  })
})
