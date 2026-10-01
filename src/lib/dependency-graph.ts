export type DependencyEdge = { blockerId: string; blockedId: string };

export function wouldCreateCycle(edges: DependencyEdge[], blockerId: string, blockedId: string): boolean {
  if (blockerId === blockedId) return true;
  const successors = new Map<string, string[]>();
  for (const edge of edges) {
    const next = successors.get(edge.blockerId) ?? [];
    next.push(edge.blockedId);
    successors.set(edge.blockerId, next);
  }
  const seen = new Set<string>();
  const pending = [blockedId];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (id === blockerId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...(successors.get(id) ?? []));
  }
  return false;
}

/** Kahn's algorithm; node order provides a stable tie-breaker for independent tasks. */
export function topologicalOrder(nodeIds: string[], edges: DependencyEdge[]): string[] {
  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  if (indegree.size !== nodeIds.length) throw new Error("Doppelte Aufgabe im Graphen.");
  const successors = new Map<string, string[]>();
  for (const edge of edges) {
    if (!indegree.has(edge.blockerId) || !indegree.has(edge.blockedId)) throw new Error("Unbekannte Aufgabe im Graphen.");
    indegree.set(edge.blockedId, indegree.get(edge.blockedId)! + 1);
    const next = successors.get(edge.blockerId) ?? [];
    next.push(edge.blockedId);
    successors.set(edge.blockerId, next);
  }
  const queue = nodeIds.filter((id) => indegree.get(id) === 0);
  const result: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    result.push(id);
    for (const successor of successors.get(id) ?? []) {
      const remaining = indegree.get(successor)! - 1;
      indegree.set(successor, remaining);
      if (remaining === 0) queue.push(successor);
    }
  }
  if (result.length !== nodeIds.length) throw new Error("Abhängigkeitszyklus.");
  return result;
}
