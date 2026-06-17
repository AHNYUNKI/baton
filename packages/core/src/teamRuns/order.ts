import type { TeamPlan, TeamRole } from "@baton/schemas";

export function computeExecutionOrder(teamPlan: TeamPlan): string[] {
  const roleById = new Map(teamPlan.roles.map((role) => [role.id, role]));
  const validParentByRole = new Map<string, string | undefined>();

  for (const role of teamPlan.roles) {
    validParentByRole.set(role.id, validParentFor(role, roleById));
  }

  const childrenByParent = new Map<string, TeamRole[]>();
  const roots: TeamRole[] = [];

  for (const role of teamPlan.roles) {
    const parentId = validParentByRole.get(role.id);
    if (parentId === undefined) {
      roots.push(role);
      continue;
    }

    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), role]);
  }

  const order: string[] = [];
  const visited = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const role = queue.shift();
    if (role === undefined || visited.has(role.id)) {
      continue;
    }

    visited.add(role.id);
    order.push(role.id);
    queue.push(...(childrenByParent.get(role.id) ?? []));
  }

  for (const role of teamPlan.roles) {
    if (!visited.has(role.id)) {
      order.push(role.id);
    }
  }

  return order;
}

function validParentFor(role: TeamRole, roleById: Map<string, TeamRole>): string | undefined {
  const parentId = role.reportsTo ?? undefined;
  if (parentId === undefined || !roleById.has(parentId)) {
    return undefined;
  }

  return hasCyclicAncestry(role, roleById) ? undefined : parentId;
}

function hasCyclicAncestry(role: TeamRole, roleById: Map<string, TeamRole>): boolean {
  const visited = new Set<string>();
  let current: TeamRole | undefined = role;

  while (current !== undefined) {
    if (visited.has(current.id)) {
      return true;
    }
    visited.add(current.id);

    const parentId: string | undefined = current.reportsTo ?? undefined;
    current = parentId === undefined ? undefined : roleById.get(parentId);
  }

  return false;
}
