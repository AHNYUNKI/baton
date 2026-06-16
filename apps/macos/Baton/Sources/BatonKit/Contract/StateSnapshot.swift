import Foundation

public struct StateSnapshot: Codable, Equatable, Sendable {
    public let total: Int
    public let byStatus: [String: Int]
    public let recent: [RunSummary]

    public init(total: Int, byStatus: [String: Int], recent: [RunSummary]) {
        self.total = total
        self.byStatus = byStatus
        self.recent = recent
    }
}
