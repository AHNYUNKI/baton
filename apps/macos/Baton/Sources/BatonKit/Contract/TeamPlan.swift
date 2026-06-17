import Foundation

public struct TeamRole: Codable, Equatable, Hashable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let description: String
    public let assignedAgentId: String
    public let instructions: String

    public init(
        id: String,
        name: String,
        description: String,
        assignedAgentId: String,
        instructions: String
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.assignedAgentId = assignedAgentId
        self.instructions = instructions
    }
}

public struct TeamPlan: Codable, Equatable, Hashable, Sendable {
    public let roles: [TeamRole]

    public init(roles: [TeamRole]) {
        self.roles = roles
    }
}
