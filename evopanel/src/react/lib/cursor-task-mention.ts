/**
 * Parse a leading `@cursor` mention from the chat composer draft.
 * Forms:
 *   @cursor 实现侧边栏折叠
 *   @cursor：实现侧边栏折叠
 *   @cursor: implement sidebar
 */

export type ParsedCursorTaskMention = {
  /** Text after the @cursor token (may be empty). */
  taskText: string
}

/**
 * @param {string} text
 * @returns {ParsedCursorTaskMention | null}
 */
export function parseCursorTaskMention(text: string): ParsedCursorTaskMention | null {
  const raw = String(text || '').trimStart()
  if (!raw) return null
  // Case-insensitive @cursor at start; word boundary so @cursorAgent does not match.
  const m = raw.match(/^@cursor\b(?:[\s:：]+([\s\S]*))?$/i)
  if (!m) return null
  const taskText = String(m[1] ?? '').trim()
  return { taskText }
}
