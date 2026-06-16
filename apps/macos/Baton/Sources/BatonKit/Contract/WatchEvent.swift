import Foundation

public enum WatchEventType: String, Codable, Sendable {
    case created = "run.created"
    case removed = "run.removed"
    case statusChanged = "run.status-changed"
    case updated = "run.updated"
}

public struct WatchEvent: Codable, Equatable, Sendable {
    public let type: WatchEventType
    public let runId: String
    public let previousStatus: RunStatus?
    public let status: RunStatus?
    public let previousUpdatedAt: String?
    public let updatedAt: String?
    public let run: RunSummary?

    public init(
        type: WatchEventType,
        runId: String,
        previousStatus: RunStatus? = nil,
        status: RunStatus? = nil,
        previousUpdatedAt: String? = nil,
        updatedAt: String? = nil,
        run: RunSummary? = nil
    ) {
        self.type = type
        self.runId = runId
        self.previousStatus = previousStatus
        self.status = status
        self.previousUpdatedAt = previousUpdatedAt
        self.updatedAt = updatedAt
        self.run = run
    }
}
