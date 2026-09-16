/**
 * Developer Tasks API client (EVO-0006.4).
 * Backend: /api/developer-tasks — plan-only; no local CLI / git / shell.
 */

import { gatewayProxy } from './tauri-api.js'

/**
 * @typedef {'draft' | 'routing_complete' | 'queued' | 'preflight_failed' | 'planning' | 'awaiting_approval' | 'failed' | 'cancelled' | string} DeveloperTaskStatus
 *
 * @typedef {object} DeveloperTaskEvent
 * @property {number} [sequence]
 * @property {string} [kind]
 * @property {string} [message]
 * @property {string} [created_at]
 *
 * @typedef {object} DeveloperTask
 * @property {string} id
 * @property {string} [provider]
 * @property {string} [evo_id]
 * @property {string} [summary]
 * @property {string[]} [allowed_paths]
 * @property {string[]} [acceptance_criteria]
 * @property {DeveloperTaskStatus} [status]
 * @property {string} [created_at]
 * @property {string} [updated_at]
 * @property {string | null} [plan_worktree]
 * @property {string | null} [plan_output]
 * @property {string | null} [error]
 * @property {boolean} [execution_available]
 * @property {boolean} [can_cancel]
 * @property {DeveloperTaskEvent[]} [events]
 *
 * @typedef {object} CreateDeveloperTaskPayload
 * @property {string} evo_id
 * @property {string} summary
 * @property {string} instructions
 * @property {string[]} allowed_paths
 * @property {string[]} [acceptance_criteria]
 */

/** Statuses the Gateway cancel endpoint will transition (EVO-0006.2). */
const CANCELABLE_STATUSES = new Set(['queued', 'awaiting_approval', 'preflight_failed'])

/**
 * Create a read-only Cursor plan task.
 * @param {CreateDeveloperTaskPayload} payload
 * @returns {Promise<DeveloperTask>}
 */
export async function createDeveloperTask(payload) {
  return gatewayProxy('POST', '/developer-tasks', payload, null, {
    preferGatewayHttp: true,
    skipDedup: true,
  })
}

/**
 * Fetch one developer task (status, plan, events).
 * @param {string} taskId
 * @returns {Promise<DeveloperTask>}
 */
export async function getDeveloperTask(taskId) {
  const id = String(taskId || '').trim()
  if (!id) throw new Error('缺少任务 ID')
  return gatewayProxy('GET', `/developer-tasks/${encodeURIComponent(id)}`, null, null, {
    preferGatewayHttp: true,
  })
}

/**
 * Cancel a task when the API allows it.
 * @param {string} taskId
 * @returns {Promise<DeveloperTask>}
 */
export async function cancelDeveloperTask(taskId) {
  const id = String(taskId || '').trim()
  if (!id) throw new Error('缺少任务 ID')
  return gatewayProxy('POST', `/developer-tasks/${encodeURIComponent(id)}/cancel`, null, null, {
    preferGatewayHttp: true,
    skipDedup: true,
  })
}

/**
 * Whether the cancel control should be shown.
 * Only queued / preflight_failed / awaiting_approval may cancel.
 * Status gate is absolute: can_cancel:true never expands beyond that set.
 * Within the set, can_cancel:false further restricts.
 * @param {DeveloperTask | null | undefined} task
 * @returns {boolean}
 */
export function developerTaskCanCancel(task) {
  if (!task || typeof task !== 'object') return false
  if (!CANCELABLE_STATUSES.has(String(task.status || ''))) return false
  // Explicit false from API blocks cancel; missing/true leaves status gate as authority.
  return task.can_cancel !== false
}

/**
 * Chinese label for a developer-task status.
 * @param {DeveloperTaskStatus | null | undefined} status
 * @returns {string}
 */
export function developerTaskStatusLabel(status) {
  switch (String(status || '')) {
    case 'draft':
      return '草稿'
    case 'routing_complete':
      return '已路由'
    case 'queued':
      return '排队中'
    case 'planning':
      return '规划中'
    case 'awaiting_approval':
      return '计划已就绪'
    case 'preflight_failed':
      return '预检失败'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    default:
      return status ? String(status) : '未知'
  }
}

/**
 * Whether polling should continue for an in-flight plan task.
 * @param {DeveloperTaskStatus | null | undefined} status
 * @returns {boolean}
 */
export function developerTaskIsInFlight(status) {
  const s = String(status || '')
  return s === 'draft' || s === 'routing_complete' || s === 'queued' || s === 'planning'
}

/**
 * Split multiline / comma-separated path input into unique repo-relative paths.
 * @param {string} text
 * @returns {string[]}
 */
export function parsePathListInput(text) {
  const raw = String(text || '')
  const parts = raw
    .split(/[\n,]+/)
    .map((p) => p.trim().replace(/\\/g, '/').replace(/\/+$/, ''))
    .filter(Boolean)
  return [...new Set(parts)]
}

/**
 * Split multiline acceptance criteria (one item per non-empty line).
 * @param {string} text
 * @returns {string[]}
 */
export function parseCriteriaListInput(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s+/, '').trim())
    .filter(Boolean)
}

const EVO_ID_RE = /^EVO-\d{4}(?:\.\d+)?$/

/**
 * @param {string} evoId
 * @returns {boolean}
 */
export function isValidEvoId(evoId) {
  return EVO_ID_RE.test(String(evoId || '').trim())
}

/**
 * Build a short summary for POST (required by Gateway; max 500).
 * @param {string} instructions
 * @param {string} [fallback]
 * @returns {string}
 */
export function buildDeveloperTaskSummary(instructions, fallback = 'Cursor 只读计划任务') {
  const line = String(instructions || '')
    .split(/\n/)
    .map((s) => s.trim())
    .find(Boolean)
  const base = (line || fallback).trim()
  return base.slice(0, 500)
}
