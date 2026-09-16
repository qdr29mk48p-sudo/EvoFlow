import { describe, expect, it } from 'vitest'
import { parseCursorTaskMention } from '../src/react/lib/cursor-task-mention.ts'

describe('parseCursorTaskMention', () => {
  it('parses @cursor followed by a task request', () => {
    expect(parseCursorTaskMention('@cursor 实现侧边栏折叠')).toEqual({
      taskText: '实现侧边栏折叠',
    })
    expect(parseCursorTaskMention('@cursor：补齐验收标准')).toEqual({
      taskText: '补齐验收标准',
    })
    expect(parseCursorTaskMention('@CURSOR: plan the composer flow')).toEqual({
      taskText: 'plan the composer flow',
    })
  })

  it('accepts bare @cursor with empty task text', () => {
    expect(parseCursorTaskMention('@cursor')).toEqual({ taskText: '' })
    expect(parseCursorTaskMention('  @cursor  ')).toEqual({ taskText: '' })
  })

  it('does not match unrelated mentions', () => {
    expect(parseCursorTaskMention('@前端架构师 检查报错')).toBeNull()
    expect(parseCursorTaskMention('请看 @cursor 文档')).toBeNull()
    expect(parseCursorTaskMention('@cursorAgent do stuff')).toBeNull()
  })
})
