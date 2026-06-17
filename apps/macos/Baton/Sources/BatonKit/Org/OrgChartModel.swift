import Foundation

public struct OrgChartNode: Equatable, Hashable, Identifiable, Sendable {
    public let roleId: String
    public let name: String
    public let description: String
    public let assignedAgentId: String
    public let status: String
    public let reportsTo: String?

    public var id: String { roleId }

    public init(
        roleId: String,
        name: String,
        description: String,
        assignedAgentId: String,
        status: String,
        reportsTo: String? = nil
    ) {
        self.roleId = roleId
        self.name = name
        self.description = description
        self.assignedAgentId = assignedAgentId
        self.status = status
        self.reportsTo = reportsTo
    }
}

public struct OrgChartTreeNode: Equatable, Identifiable, Sendable {
    public let node: OrgChartNode
    public let children: [OrgChartTreeNode]
    public let depth: Int

    public var id: String { node.roleId }

    public init(node: OrgChartNode, children: [OrgChartTreeNode], depth: Int) {
        self.node = node
        self.children = children
        self.depth = depth
    }
}

public struct OrgChart: Equatable, Sendable {
    public let leadAgentId: String?
    public let hasPlan: Bool
    public let roots: [OrgChartTreeNode]

    public init(leadAgentId: String?, hasPlan: Bool, roots: [OrgChartTreeNode]) {
        self.leadAgentId = leadAgentId
        self.hasPlan = hasPlan
        self.roots = roots
    }
}

public enum OrgChartModel {
    public static let defaultStatus = "planned"

    public static func buildOrgChart(
        project: Project,
        teamPlan: TeamPlan? = nil,
        statusByRole: [String: String]? = nil
    ) -> OrgChart {
        let plan = teamPlan ?? project.teamPlan
        let leadAgentId = normalized(project.leadAgentId) ?? singleAgentLead(from: project.agentIds)

        guard let plan else {
            return OrgChart(leadAgentId: leadAgentId, hasPlan: false, roots: [])
        }

        let roleIds = Set(plan.roles.map(\.id))
        var validParentByRoleId: [String: String] = [:]
        for role in plan.roles {
            guard
                let reportsTo = normalized(role.reportsTo),
                reportsTo != role.id,
                roleIds.contains(reportsTo)
            else {
                continue
            }
            validParentByRoleId[role.id] = reportsTo
        }
        let cyclicRoleIds = findCyclicRoleIds(parentByRoleId: validParentByRoleId)
        let effectiveParentByRoleId = validParentByRoleId.filter { roleId, _ in
            !cyclicRoleIds.contains(roleId)
        }

        var rootRoles: [TeamRole] = []
        var childrenByParentId: [String: [TeamRole]] = [:]
        for role in plan.roles {
            if let parentId = effectiveParentByRoleId[role.id] {
                childrenByParentId[parentId, default: []].append(role)
            } else {
                rootRoles.append(role)
            }
        }

        let roots = rootRoles.map { role in
            treeNode(
                role: role,
                depth: 0,
                statusByRole: statusByRole,
                effectiveParentByRoleId: effectiveParentByRoleId,
                childrenByParentId: childrenByParentId
            )
        }

        return OrgChart(leadAgentId: leadAgentId, hasPlan: true, roots: roots)
    }

    private static func treeNode(
        role: TeamRole,
        depth: Int,
        statusByRole: [String: String]?,
        effectiveParentByRoleId: [String: String],
        childrenByParentId: [String: [TeamRole]]
    ) -> OrgChartTreeNode {
        let node = OrgChartNode(
            roleId: role.id,
            name: role.name,
            description: role.description,
            assignedAgentId: role.assignedAgentId,
            status: statusByRole?[role.id] ?? defaultStatus,
            reportsTo: effectiveParentByRoleId[role.id]
        )
        let children = childrenByParentId[role.id, default: []].map { child in
            treeNode(
                role: child,
                depth: depth + 1,
                statusByRole: statusByRole,
                effectiveParentByRoleId: effectiveParentByRoleId,
                childrenByParentId: childrenByParentId
            )
        }

        return OrgChartTreeNode(node: node, children: children, depth: depth)
    }

    private static func findCyclicRoleIds(parentByRoleId: [String: String]) -> Set<String> {
        var cyclic: Set<String> = []
        var visited: Set<String> = []
        var visiting: Set<String> = []
        var stack: [String] = []

        func visit(_ roleId: String) {
            if visited.contains(roleId) {
                return
            }
            if visiting.contains(roleId) {
                if let cycleStart = stack.firstIndex(of: roleId) {
                    cyclic.formUnion(stack[cycleStart...])
                }
                return
            }

            visiting.insert(roleId)
            stack.append(roleId)
            if let parentId = parentByRoleId[roleId] {
                visit(parentId)
            }
            _ = stack.popLast()
            visiting.remove(roleId)
            visited.insert(roleId)
        }

        for roleId in parentByRoleId.keys {
            visit(roleId)
        }

        return cyclic
    }

    private static func singleAgentLead(from agentIds: [String]) -> String? {
        guard agentIds.count == 1 else {
            return nil
        }
        return normalized(agentIds.first)
    }

    private static func normalized(_ value: String?) -> String? {
        guard let value else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
