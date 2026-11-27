// A Staff food category group covers its own picks and picks in the groups it can be swapped to.
export type SwapRule = { key: string; amount: number; swapKeys: string[] };

export function swapRules(
  allowances: { categoryId: string; amount: number; swapCategoryIds?: string[] }[],
): SwapRule[] {
  return allowances.map((allowance) => ({
    key: allowance.categoryId,
    amount: allowance.amount,
    swapKeys: allowance.swapCategoryIds ?? [],
  }));
}

export function swapsCover(rules: SwapRule[], demand: Map<string, number>) {
  const n = rules.length;
  const size = 2 * n + 2;
  const source = 2 * n;
  const sink = source + 1;
  const capacity = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  );
  let needed = 0;
  for (const [key, quantity] of demand) {
    if (quantity > 0 && !rules.some((rule) => rule.key === key)) return false;
  }
  rules.forEach((rule, i) => {
    capacity[source][i] = rule.amount;
    const quantity = demand.get(rule.key) ?? 0;
    capacity[n + i][sink] = quantity;
    needed += quantity;
    rules.forEach((target, j) => {
      if (i === j || rule.swapKeys.includes(target.key)) {
        capacity[i][n + j] = Infinity;
      }
    });
  });

  // Max flow with breadth-first augmenting paths; the graph has at most 42 nodes.
  let flow = 0;
  while (flow < needed) {
    const parent = new Array<number>(size).fill(-1);
    parent[source] = source;
    const queue = [source];
    while (queue.length && parent[sink] < 0) {
      const node = queue.shift()!;
      for (let next = 0; next < size; next += 1) {
        if (parent[next] < 0 && capacity[node][next] > 0) {
          parent[next] = node;
          queue.push(next);
        }
      }
    }
    if (parent[sink] < 0) return false;
    let push = Infinity;
    for (let node = sink; node !== source; node = parent[node]) {
      push = Math.min(push, capacity[parent[node]][node]);
    }
    for (let node = sink; node !== source; node = parent[node]) {
      capacity[parent[node]][node] -= push;
      capacity[node][parent[node]] += push;
    }
    flow += push;
  }
  return true;
}

// How many more picks the group `key` can take on top of `demand`.
export function swapRemaining(
  rules: SwapRule[],
  demand: Map<string, number>,
  key: string,
) {
  const total = rules.reduce((sum, rule) => sum + rule.amount, 0);
  const next = new Map(demand);
  let extra = 0;
  while (extra < total) {
    next.set(key, (demand.get(key) ?? 0) + extra + 1);
    if (!swapsCover(rules, next)) break;
    extra += 1;
  }
  return extra;
}
