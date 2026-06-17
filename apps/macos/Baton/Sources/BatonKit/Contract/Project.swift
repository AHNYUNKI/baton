import Foundation

public enum ProjectSourceKind: String, Codable, CaseIterable, Sendable {
    case local
    case github
}

public struct ProjectSource: Codable, Equatable, Hashable, Sendable {
    public let kind: ProjectSourceKind
    public let value: String

    public init(kind: ProjectSourceKind, value: String) {
        self.kind = kind
        self.value = value
    }
}

public struct Project: Codable, Equatable, Hashable, Identifiable, Sendable {
    public let id: String
    public let name: String
    public let source: ProjectSource
    public let agentIds: [String]
    public let leadAgentId: String?
    public let createdAt: String

    public init(
        id: String,
        name: String,
        source: ProjectSource,
        agentIds: [String],
        leadAgentId: String? = nil,
        createdAt: String
    ) {
        self.id = id
        self.name = name
        self.source = source
        self.agentIds = agentIds
        self.leadAgentId = leadAgentId
        self.createdAt = createdAt
    }
}

public struct AgentCatalogEntry: Codable, Equatable, Hashable, Identifiable, Sendable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

public enum AgentCatalog {
    public static let entries: [AgentCatalogEntry] = [
        AgentCatalogEntry(id: "codex", name: "Codex"),
        AgentCatalogEntry(id: "claude", name: "Claude")
    ]

    public static let ids: Set<String> = Set(entries.map(\.id))

    public static func contains(_ id: String) -> Bool {
        ids.contains(id)
    }

    public static func displayName(for id: String) -> String {
        entries.first { $0.id == id }?.name ?? id
    }
}
