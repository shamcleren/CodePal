export type ProjectGroupLike = {
  key: string;
};

export type KeyedItemLike = {
  id: string;
};

export type DropPlacement = "before" | "after";

export function moveProjectKey(
  order: readonly string[],
  draggedKey: string,
  targetKey: string,
  placement: DropPlacement = "before",
): string[] {
  if (draggedKey === targetKey) {
    return [...order];
  }

  const fromIndex = order.indexOf(draggedKey);
  const targetIndex = order.indexOf(targetKey);
  if (fromIndex === -1 || targetIndex === -1) {
    return [...order];
  }

  const next = [...order];
  const [dragged] = next.splice(fromIndex, 1);
  const insertIndex = next.indexOf(targetKey);
  next.splice(placement === "after" ? insertIndex + 1 : insertIndex, 0, dragged);
  return next;
}

export function orderProjectGroups<T extends ProjectGroupLike>(
  groups: readonly T[],
  preferredOrder: readonly string[],
): T[] {
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const ordered: T[] = [];
  const seen = new Set<string>();

  for (const key of preferredOrder) {
    const group = byKey.get(key);
    if (!group || seen.has(key)) {
      continue;
    }
    ordered.push(group);
    seen.add(key);
  }

  for (const group of groups) {
    if (!seen.has(group.key)) {
      ordered.push(group);
    }
  }

  return ordered;
}

export function orderKeyedItems<T extends KeyedItemLike>(
  items: readonly T[],
  preferredOrder: readonly string[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: T[] = [];
  const seen = new Set<string>();

  for (const id of preferredOrder) {
    const item = byId.get(id);
    if (!item || seen.has(id)) {
      continue;
    }
    ordered.push(item);
    seen.add(id);
  }

  for (const item of items) {
    if (!seen.has(item.id)) {
      ordered.push(item);
    }
  }

  return ordered;
}
