/**
 * EVO-0006.4 — @cursor 只读计划任务创建 / 状态面板。
 * 调用 Gateway Developer Tasks API；不执行代码、不提交、不推送、不建 PR、不合并。
 */
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useModalEscapeClose } from '../hooks/useModalEscapeClose.js'
import {
  buildDeveloperTaskSummary,
  cancelDeveloperTask,
  createDeveloperTask,
  developerTaskCanCancel,
  developerTaskIsInFlight,
  developerTaskStatusLabel,
  getDeveloperTask,
  isValidEvoId,
  parseCriteriaListInput,
  parsePathListInput,
} from '../../lib/developer-tasks.js'

type DeveloperTask = {
  id: string
  evo_id?: string
  status?: string
  plan_output?: string | null
  error?: string | null
  execution_available?: boolean
  can_cancel?: boolean
  events?: Array<{ sequence?: number; kind?: string; message?: string; created_at?: string }>
}

export type CursorDeveloperTaskModalProps = {
  open: boolean
  /** Prefill from `@cursor …` composer text. */
  initialInstructions?: string
  onClose: () => void
}

const POLL_MS = 2000
const PLAN_DISCLAIMER =
  '本流程仅创建只读计划，不能执行代码、提交、推送、创建 Pull Request 或合并。执行能力尚未开放。'

function errMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message || err)
  }
  return String(err || '未知错误')
}

/** Fresh mount each time the overlay opens — no reset-in-effect needed. */
function CursorDeveloperTaskDialog({
  initialInstructions,
  onClose,
}: {
  initialInstructions: string
  onClose: () => void
}) {
  const titleId = useId()
  const evoIdRef = useRef<HTMLInputElement | null>(null)

  const [evoId, setEvoId] = useState('')
  const [allowedPathsText, setAllowedPathsText] = useState('evopanel/src')
  const [instructions, setInstructions] = useState(initialInstructions)
  const [criteriaText, setCriteriaText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [task, setTask] = useState<DeveloperTask | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => evoIdRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [])

  const refreshTask = useCallback(async (taskId: string) => {
    const next = await getDeveloperTask(taskId)
    setTask(next)
    setPollError(null)
    return next
  }, [])

  useEffect(() => {
    if (!task?.id) return
    if (!developerTaskIsInFlight(task.status)) return
    let cancelled = false
    const tick = async () => {
      try {
        const next = await getDeveloperTask(task.id)
        if (!cancelled) {
          setTask(next)
          setPollError(null)
        }
      } catch (err) {
        if (!cancelled) setPollError(errMessage(err))
      }
    }
    const timer = window.setInterval(() => {
      void tick()
    }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [task?.id, task?.status])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setFormError(null)

    const evo = evoId.trim()
    if (!isValidEvoId(evo)) {
      setFormError('EVO 编号格式应为 EVO-0000 或 EVO-0000.1')
      return
    }
    const paths = parsePathListInput(allowedPathsText)
    if (!paths.length) {
      setFormError('请至少填写一个仓库相对路径')
      return
    }
    for (const p of paths) {
      if (p.startsWith('/') || p.includes('..') || p === '.') {
        setFormError(`路径必须是仓库相对路径：${p}`)
        return
      }
    }
    const instr = instructions.trim()
    if (!instr) {
      setFormError('请填写任务说明')
      return
    }
    const criteria = parseCriteriaListInput(criteriaText)

    setSubmitting(true)
    try {
      const created = await createDeveloperTask({
        evo_id: evo,
        summary: buildDeveloperTaskSummary(instr),
        instructions: instr,
        allowed_paths: paths,
        acceptance_criteria: criteria,
      })
      setTask(created)
    } catch (err) {
      setFormError(errMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const onCancelTask = async () => {
    if (!task?.id || cancelling || !developerTaskCanCancel(task)) return
    setCancelling(true)
    setPollError(null)
    try {
      const next = await cancelDeveloperTask(task.id)
      setTask(next)
    } catch (err) {
      setPollError(errMessage(err))
    } finally {
      setCancelling(false)
    }
  }

  const onRefresh = async () => {
    if (!task?.id) return
    try {
      await refreshTask(task.id)
    } catch (err) {
      setPollError(errMessage(err))
    }
  }

  /** Prevent composer-level Enter handling from stealing focus while the dialog is open. */
  const stopEnterBubble = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target instanceof HTMLTextAreaElement) {
      e.stopPropagation()
    }
  }

  const canCancel = developerTaskCanCancel(task)
  const statusLabel = developerTaskStatusLabel(task?.status)
  const inFlight = developerTaskIsInFlight(task?.status)

  return (
    <div
      className="react-chat-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="react-chat-modal-card react-chat-modal-card--settings cursor-dev-task-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={stopEnterBubble}
      >
        <div className="react-chat-modal-header">
          <div className="react-chat-modal-title" id={titleId}>
            Cursor 只读计划任务
          </div>
          <button type="button" className="react-chat-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="react-chat-modal-body cursor-dev-task-modal__body">
          <p className="form-hint cursor-dev-task-modal__disclaimer" role="note">
            {PLAN_DISCLAIMER}
          </p>

          {!task ? (
            <form className="cursor-dev-task-modal__form" onSubmit={(e) => void onSubmit(e)}>
              <label className="form-label" htmlFor="cursor-dev-task-evo">
                EVO 编号
              </label>
              <input
                ref={evoIdRef}
                id="cursor-dev-task-evo"
                className="form-input"
                type="text"
                value={evoId}
                onChange={(e) => setEvoId(e.target.value)}
                placeholder="EVO-0006.4"
                autoComplete="off"
                disabled={submitting}
                required
              />

              <label className="form-label" htmlFor="cursor-dev-task-paths">
                允许路径（仓库相对，每行一个）
              </label>
              <textarea
                id="cursor-dev-task-paths"
                className="form-input cursor-dev-task-modal__textarea"
                value={allowedPathsText}
                onChange={(e) => setAllowedPathsText(e.target.value)}
                placeholder={'evopanel/src\ndocs/tasks'}
                rows={3}
                disabled={submitting}
                required
                style={{ resize: 'none' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) e.stopPropagation()
                }}
              />

              <label className="form-label" htmlFor="cursor-dev-task-instructions">
                任务说明
              </label>
              <textarea
                id="cursor-dev-task-instructions"
                className="form-input cursor-dev-task-modal__textarea"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="描述需要规划的改动范围与目标…"
                rows={5}
                disabled={submitting}
                required
                style={{ resize: 'none' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) e.stopPropagation()
                }}
              />

              <label className="form-label" htmlFor="cursor-dev-task-criteria">
                验收标准（每行一条，可选）
              </label>
              <textarea
                id="cursor-dev-task-criteria"
                className="form-input cursor-dev-task-modal__textarea"
                value={criteriaText}
                onChange={(e) => setCriteriaText(e.target.value)}
                placeholder={'单元测试覆盖 @cursor 解析\n界面明确声明不可执行代码'}
                rows={3}
                disabled={submitting}
                style={{ resize: 'none' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) e.stopPropagation()
                }}
              />

              {formError ? (
                <p className="form-hint cursor-dev-task-modal__error" role="alert">
                  {formError}
                </p>
              ) : null}

              <div className="cursor-dev-task-modal__actions">
                <button
                  type="button"
                  className="react-chat-modal-btn react-chat-modal-btn--ghost"
                  onClick={onClose}
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="react-chat-modal-btn react-chat-modal-btn--primary"
                  disabled={submitting}
                  aria-busy={submitting}
                >
                  {submitting ? '创建中…' : '创建只读计划'}
                </button>
              </div>
            </form>
          ) : (
            <div className="cursor-dev-task-modal__status" aria-live="polite">
              <dl className="dev-agent-fields">
                <div className="dev-agent-field">
                  <dt>任务 ID</dt>
                  <dd>
                    <code className="dev-agent-mono">{task.id}</code>
                  </dd>
                </div>
                <div className="dev-agent-field">
                  <dt>EVO</dt>
                  <dd>{task.evo_id || '—'}</dd>
                </div>
                <div className="dev-agent-field">
                  <dt>状态</dt>
                  <dd>
                    <span className="sec-mode-badge sec-mode-badge--muted">{statusLabel}</span>
                    {inFlight ? <span className="form-hint"> · 刷新中…</span> : null}
                  </dd>
                </div>
                <div className="dev-agent-field">
                  <dt>可执行</dt>
                  <dd>{task.execution_available ? '是' : '否（仅只读计划）'}</dd>
                </div>
                {task.error ? (
                  <div className="dev-agent-field">
                    <dt>错误</dt>
                    <dd className="cursor-dev-task-modal__error">{task.error}</dd>
                  </div>
                ) : null}
              </dl>

              {task.plan_output ? (
                <div className="cursor-dev-task-modal__plan">
                  <div className="form-label">只读计划输出</div>
                  <p className="form-hint" role="note">
                    以下内容为只读计划结果，不能执行代码、提交、推送、创建 PR 或合并。
                  </p>
                  <pre className="cursor-dev-task-modal__plan-pre">{task.plan_output}</pre>
                </div>
              ) : inFlight ? (
                <div className="cursor-dev-task-modal__plan" aria-busy="true">
                  <div className="form-label">只读计划输出</div>
                  <p className="form-hint">正在生成只读计划…</p>
                </div>
              ) : null}

              {Array.isArray(task.events) && task.events.length > 0 ? (
                <div className="cursor-dev-task-modal__events">
                  <div className="form-label">事件</div>
                  <ol className="cursor-dev-task-modal__event-list">
                    {task.events.map((ev, idx) => (
                      <li key={`${ev.sequence ?? idx}-${ev.created_at ?? idx}`}>
                        <span className="cursor-dev-task-modal__event-kind">{ev.kind || 'event'}</span>
                        {ev.message ? <span>{ev.message}</span> : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {pollError ? (
                <p className="form-hint cursor-dev-task-modal__error" role="alert">
                  {pollError}
                </p>
              ) : null}

              <div className="cursor-dev-task-modal__actions">
                <button
                  type="button"
                  className="react-chat-modal-btn react-chat-modal-btn--ghost"
                  onClick={onClose}
                >
                  关闭
                </button>
                <button
                  type="button"
                  className="react-chat-modal-btn react-chat-modal-btn--ghost"
                  onClick={() => void onRefresh()}
                >
                  刷新状态
                </button>
                {canCancel ? (
                  <button
                    type="button"
                    className="react-chat-modal-btn react-chat-modal-btn--ghost"
                    onClick={() => void onCancelTask()}
                    disabled={cancelling}
                    aria-busy={cancelling}
                  >
                    {cancelling ? '取消中…' : '取消任务'}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CursorDeveloperTaskModal({
  open,
  initialInstructions = '',
  onClose,
}: CursorDeveloperTaskModalProps) {
  useModalEscapeClose(onClose, { open })

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <CursorDeveloperTaskDialog
      initialInstructions={initialInstructions}
      onClose={onClose}
    />,
    document.body,
  )
}
