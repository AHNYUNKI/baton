import Foundation

public struct TeamRunStreamEvent: Codable, Equatable, Sendable {
    public let type: String
    public let roleId: String?
    public let chunk: String?

    public init(type: String, roleId: String? = nil, chunk: String? = nil) {
        self.type = type
        self.roleId = roleId
        self.chunk = chunk
    }
}

public enum TeamRunStreamItem: Equatable, Sendable {
    case event(TeamRunStreamEvent)
    case final(TeamRun)
}
