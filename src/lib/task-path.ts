/** Task, subtask, sub-subtask … – a path like "1.2.3" has this many parts at most. */
export const MAX_TASK_DEPTH = 6;

export function taskDepth(path: string): number {
  return path.split(".").length;
}
