import Foundation

public struct OrgChartNode: Equatable, Hashable, Identifiable, Sendable {
    public let roleId: String
    public let name: String
    public let assignedAgentId: String
    public let status: String

    public var id: String { roleId }

    public init(roleId: String, name: String, assignedAgentId: String, status: String) {
        self.roleId = roleId
        self.name = name
        self.assignedAgentId = assignedAgentId
        self.status = status
    }
}

public struct OrgChart: Equatable, Sendable {
    public let leadAgentId: String?
    public let hasPlan: Bool
    public let nodes: [OrgChartNode]

    public init(leadAgentId: String?, hasPlan: Bool, nodes: [OrgChartNode]) {
        self.leadAgentId = leadAgentId
        self.hasPlan = hasPlan
        self.nodes = nodes
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
            return OrgChart(leadAgentId: leadAgentId, hasPlan: false, nodes: [])
        }

        let nodes = plan.roles.map { role in
            OrgChartNode(
                roleId: role.id,
                name: role.name,
                assignedAgentId: role.assignedAgentId,
                status: statusByRole?[role.id] ?? defaultStatus
            )
        }

        return OrgChart(leadAgentId: leadAgentId, hasPlan: true, nodes: nodes)
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
