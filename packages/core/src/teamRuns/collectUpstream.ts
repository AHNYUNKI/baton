import type { TeamPlan, TeamRole } from "@baton/schemas";

export function collectUpstreamRoleIds(roleId: string, teamPlan: TeamPlan): string[] {
  const roleById = new Map(teamPlan.roles.map((role) => [role.id, role]));
  const role = roleById.get(roleId);
  if (role === undefined || hasCyclicAncestry(role, roleById)) {
    return [];
  }

  const upstream: string[] = [];
  const visited = new Set<string>([role.id]);
  let parentId: string | undefined = role.reportsTo ?? undefined;

  while (parentId !== undefined) {
    const parent = roleById.get(parentId);
    if (parent === undefined || visited.has(parent.id)) {
      break;
    }

    upstream.push(parent.id);
    visited.add(parent.id);
    parentId = parent.reportsTo ?? undefined;
  }

  return upstream.reverse();
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
