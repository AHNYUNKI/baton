import Foundation

public enum TeamPlanEditModelError: Error, Equatable, LocalizedError, Sendable {
    case invalidPlan

    public var errorDescription: String? {
        switch self {
        case .invalidPlan:
            "TeamPlan is incomplete or invalid."
        }
    }
}

public struct EditableTeamRole: Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var description: String
    public var assignedAgentId: String
    public var instructions: String
    public var reportsTo: String?

    public init(
        id: String,
        name: String,
        description: String,
        assignedAgentId: String,
        instructions: String,
        reportsTo: String? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.assignedAgentId = assignedAgentId
        self.instructions = instructions
        self.reportsTo = reportsTo
    }

    public init(role: TeamRole) {
        self.init(
            id: role.id,
            name: role.name,
            description: role.description,
            assignedAgentId: role.assignedAgentId,
            instructions: role.instructions,
            reportsTo: role.reportsTo
        )
    }

    public func toTeamRole() -> TeamRole {
        TeamRole(
            id: id.trimmingCharacters(in: .whitespacesAndNewlines),
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            description: description,
            assignedAgentId: assignedAgentId.trimmingCharacters(in: .whitespacesAndNewlines),
            instructions: instructions,
            reportsTo: Self.normalizedReportsTo(reportsTo)
        )
    }

    private static func normalizedReportsTo(_ value: String?) -> String? {
        guard let value else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

public struct TeamPlanEditModel: Equatable, Sendable {
    public private(set) var agentIds: [String]
    public var roles: [EditableTeamRole]

    public init(agentIds: [String], plan: TeamPlan? = nil) {
        self.agentIds = Self.normalizedAgentIds(agentIds)
        self.roles = plan?.roles.map(EditableTeamRole.init(role:)) ?? []
    }

    public var isValid: Bool {
        guard !roles.isEmpty, !agentIds.isEmpty else {
            return false
        }

        var seen: Set<String> = []
        for role in roles {
            let roleId = role.id.trimmingCharacters(in: .whitespacesAndNewlines)
            let name = role.name.trimmingCharacters(in: .whitespacesAndNewlines)
            let assignedAgentId = role.assignedAgentId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !roleId.isEmpty, !name.isEmpty, agentIds.contains(assignedAgentId), seen.insert(roleId).inserted else {
                return false
            }
        }
        return true
    }

    public var validationMessage: String? {
        if roles.isEmpty {
            return "역할을 하나 이상 추가하세요."
        }
        if agentIds.isEmpty {
            return "프로젝트에 사용할 AI가 없습니다."
        }
        if roles.contains(where: { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
            return "역할 이름을 입력하세요."
        }
        if roles.contains(where: { !agentIds.contains($0.assignedAgentId.trimmingCharacters(in: .whitespacesAndNewlines)) }) {
            return "담당 AI는 프로젝트에 포함된 AI 중에서 선택하세요."
        }
        if Set(roles.map { $0.id.trimmingCharacters(in: .whitespacesAndNewlines) }).count != roles.count {
            return "역할 ID가 중복되었습니다."
        }
        return nil
    }

    public mutating func addRole() {
        let roleId = nextRoleId()
        roles.append(
            EditableTeamRole(
                id: roleId,
                name: "새 역할",
                description: "",
                assignedAgentId: agentIds.first ?? "",
                instructions: "",
                reportsTo: nil
            )
        )
    }

    public mutating func removeRole(id: String) {
        roles.removeAll { $0.id == id }
    }

    @discardableResult
    public mutating func updateAssignedAgent(roleId: String, agentId: String) -> Bool {
        let trimmed = agentId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard agentIds.contains(trimmed), let index = roles.firstIndex(where: { $0.id == roleId }) else {
            return false
        }
        roles[index].assignedAgentId = trimmed
        return true
    }

    @discardableResult
    public mutating func updateReportsTo(roleId: String, reportsTo: String?) -> Bool {
        guard let index = roles.firstIndex(where: { $0.id == roleId }) else {
            return false
        }

        let trimmed = reportsTo?.trimmingCharacters(in: .whitespacesAndNewlines)
        roles[index].reportsTo = trimmed?.isEmpty == true ? nil : trimmed
        return true
    }

    public func toTeamPlan() throws -> TeamPlan {
        guard isValid else {
            throw TeamPlanEditModelError.invalidPlan
        }
        return TeamPlan(roles: roles.map { $0.toTeamRole() })
    }

    public func toJSON() throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(try toTeamPlan())
        return String(decoding: data, as: UTF8.self)
    }

    private func nextRoleId() -> String {
        var candidate = "role-\(roles.count + 1)"
        var suffix = roles.count + 1
        let existing = Set(roles.map(\.id))
        while existing.contains(candidate) {
            suffix += 1
            candidate = "role-\(suffix)"
        }
        return candidate
    }

    private static func normalizedAgentIds(_ agentIds: [String]) -> [String] {
        var seen: Set<String> = []
        return agentIds
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { seen.insert($0).inserted }
    }
}
