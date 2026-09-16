/**
 * Documents the ChatComposer → ChatApp @cursor gate:
 * leading @cursor opens the developer-task modal instead of onSend.
 */
import { describe, expect, it } from 'vitest'
import { parseCursorTaskMention } from '../src/react/lib/cursor-task-mention.ts'

/**
 * Mirrors ChatComposer.handleSend routing for a leading @cursor draft.
 * @param {string} draft
 * @param {{ onSend: (t: string) => void, onOpenCursorTask: (t: string) => void }} handlers
 */
function routeComposerSubmit(draft, handlers) {
  const t = String(draft || '').trim()
  const cursorMention = parseCursorTaskMention(t)
  if (cursorMention) {
    handlers.onOpenCursorTask(cursorMention.taskText)
    return 'cursor-task'
  }
  handlers.onSend(t)
  return 'chat'
}

describe('composer @cursor submit routing', () => {
  it('opens cursor task modal and does not send to the LLM', () => {
    const sent = []
    const opened = []
    expect(
      routeComposerSubmit('@cursor 实现侧边栏折叠', {
        onSend: (t) => sent.push(t),
        onOpenCursorTask: (t) => opened.push(t),
      }),
    ).toBe('cursor-task')
    expect(opened).toEqual(['实现侧边栏折叠'])
    expect(sent).toEqual([])
  })

  it('opens modal for bare @cursor with empty instructions', () => {
    const sent = []
    const opened = []
    expect(
      routeComposerSubmit('@cursor', {
        onSend: (t) => sent.push(t),
        onOpenCursorTask: (t) => opened.push(t),
      }),
    ).toBe('cursor-task')
    expect(opened).toEqual([''])
    expect(sent).toEqual([])
  })

  it('keeps normal chat send for non-mention drafts', () => {
    const sent = []
    const opened = []
    expect(
      routeComposerSubmit('你好，帮我看看这段代码', {
        onSend: (t) => sent.push(t),
        onOpenCursorTask: (t) => opened.push(t),
      }),
    ).toBe('chat')
    expect(sent).toEqual(['你好，帮我看看这段代码'])
    expect(opened).toEqual([])
  })
})
