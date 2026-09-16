/** @vitest-environment happy-dom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import React from 'react'

const createDeveloperTask = vi.fn()
const getDeveloperTask = vi.fn()
const cancelDeveloperTask = vi.fn()

vi.mock('../src/lib/developer-tasks.js', async () => {
  const actual = await vi.importActual('../src/lib/developer-tasks.js')
  return {
    ...actual,
    createDeveloperTask: (...args) => createDeveloperTask(...args),
    getDeveloperTask: (...args) => getDeveloperTask(...args),
    cancelDeveloperTask: (...args) => cancelDeveloperTask(...args),
  }
})

import { CursorDeveloperTaskModal } from '../src/react/components/CursorDeveloperTaskModal.tsx'

function fillRequiredFields(overrides = {}) {
  const values = {
    evo: 'EVO-0006.4',
    paths: 'evopanel/src',
    instructions: '在聊天里接入 @cursor',
    criteria: '',
    ...overrides,
  }
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('EVO 编号'), { target: { value: values.evo } })
  fireEvent.change(within(dialog).getByLabelText(/允许路径/), { target: { value: values.paths } })
  fireEvent.change(within(dialog).getByLabelText('任务说明'), {
    target: { value: values.instructions },
  })
  if (values.criteria) {
    fireEvent.change(within(dialog).getByLabelText(/验收标准/), {
      target: { value: values.criteria },
    })
  }
}

function activeDialog() {
  const dialogs = screen.getAllByRole('dialog')
  return dialogs[dialogs.length - 1]
}

describe('CursorDeveloperTaskModal', () => {
  beforeEach(() => {
    createDeveloperTask.mockReset()
    getDeveloperTask.mockReset()
    cancelDeveloperTask.mockReset()
    cleanup()
    document.querySelectorAll('.react-chat-modal-overlay').forEach((el) => el.remove())
    document.body.innerHTML = ''
  })

  afterEach(() => {
    cleanup()
    document.querySelectorAll('.react-chat-modal-overlay').forEach((el) => el.remove())
    document.body.innerHTML = ''
  })

  it('shows the read-only plan disclaimer and creates a task via the API client', async () => {
    createDeveloperTask.mockResolvedValue({
      id: 'devtask-abc',
      evo_id: 'EVO-0006.4',
      status: 'queued',
      execution_available: false,
      can_cancel: true,
      events: [{ sequence: 1, kind: 'status', message: '排队中' }],
      plan_output: null,
    })

    const view = render(
      <CursorDeveloperTaskModal
        open
        initialInstructions="在聊天里接入 @cursor"
        onClose={() => {}}
      />,
    )

    const dialog = activeDialog()
    expect(within(dialog).getByText(/仅创建只读计划/)).toBeTruthy()
    expect(within(dialog).getByText(/不能执行代码、提交、推送/)).toBeTruthy()

    fillRequiredFields({
      paths: 'evopanel/src\nevopanel/tests',
      criteria: '有单元测试',
    })

    fireEvent.click(within(dialog).getByRole('button', { name: '创建只读计划' }))

    await waitFor(() => {
      expect(createDeveloperTask).toHaveBeenCalledWith({
        evo_id: 'EVO-0006.4',
        summary: '在聊天里接入 @cursor',
        instructions: '在聊天里接入 @cursor',
        allowed_paths: ['evopanel/src', 'evopanel/tests'],
        acceptance_criteria: ['有单元测试'],
      })
    })

    await waitFor(() => {
      expect(within(activeDialog()).getByText('devtask-abc')).toBeTruthy()
      expect(within(activeDialog()).getByText(/否（仅只读计划）/)).toBeTruthy()
    })

    expect(within(activeDialog()).getByRole('button', { name: '取消任务' })).toBeTruthy()
    view.unmount()
  })

  it('labels plan output as read-only and shows cancel for awaiting_approval', async () => {
    createDeveloperTask.mockResolvedValue({
      id: 'devtask-plan',
      evo_id: 'EVO-0006.4',
      status: 'awaiting_approval',
      execution_available: false,
      can_cancel: true,
      events: [{ sequence: 1, kind: 'status', message: '计划已就绪' }],
      plan_output: '1. 改 ChatComposer\n2. 加测试',
    })

    const view = render(
      <CursorDeveloperTaskModal open initialInstructions="出只读计划" onClose={() => {}} />,
    )

    fillRequiredFields({ instructions: '出只读计划' })
    fireEvent.click(within(activeDialog()).getByRole('button', { name: '创建只读计划' }))

    await waitFor(() => {
      const dialog = activeDialog()
      expect(within(dialog).getByText('只读计划输出')).toBeTruthy()
      expect(within(dialog).getByText(/以下内容为只读计划结果/)).toBeTruthy()
      expect(within(dialog).getByText(/1\. 改 ChatComposer/)).toBeTruthy()
    })

    expect(within(activeDialog()).getByRole('button', { name: '取消任务' })).toBeTruthy()
    view.unmount()
  })

  it('hides cancel when status is not cancelable', async () => {
    createDeveloperTask.mockResolvedValue({
      id: 'devtask-xyz',
      evo_id: 'EVO-0006.4',
      status: 'planning',
      execution_available: false,
      can_cancel: false,
      events: [],
      plan_output: null,
    })

    const view = render(
      <CursorDeveloperTaskModal open initialInstructions="规划一下" onClose={() => {}} />,
    )

    fillRequiredFields({ instructions: '规划一下' })
    fireEvent.click(within(activeDialog()).getByRole('button', { name: '创建只读计划' }))

    await waitFor(() => {
      expect(within(activeDialog()).getByText('devtask-xyz')).toBeTruthy()
    })

    expect(within(activeDialog()).queryByRole('button', { name: '取消任务' })).toBeNull()
    view.unmount()
  })
})
