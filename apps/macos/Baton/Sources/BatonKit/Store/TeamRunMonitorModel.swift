import Foundation

public struct TeamRunMonitorModel: Equatable, Sendable {
    public private(set) var summaries: [TeamRunSummary]
    public private(set) var selectedId: String?
    public private(set) var current: TeamRun?

    public init(
        summaries: [TeamRunSummary] = [],
        selectedId: String? = nil,
        current: TeamRun? = nil
    ) {
        self.summaries = Self.sorted(summaries)
        self.selectedId = selectedId
        self.current = current
        if self.selectedId == nil {
            self.selectedId = latest?.teamRunId
        }
    }

    public var selected: TeamRunSummary? {
        if let selectedId, let summary = summaries.first(where: { $0.teamRunId == selectedId }) {
            return summary
        }
        return latest
    }

    public var latest: TeamRunSummary? {
        summaries.max { left, right in
            if left.createdAt != right.createdAt {
                return left.createdAt < right.createdAt
            }
            return left.teamRunId > right.teamRunId
        }
    }

    public var canApprove: Bool {
        current?.status == "awaiting-approval"
    }

    public var canReview: Bool {
        current?.status == "awaiting-review"
    }

    public var statusByRole: [String: String] {
        guard let current else {
            return [:]
        }
        return teamRunStatusByRole(current)
    }

    public mutating func select(id: String?) {
        selectedId = id
        if current?.id != id {
            current = nil
        }
    }

    public mutating func setCurrent(_ teamRun: TeamRun) {
        current = teamRun
        selectedId = teamRun.id

        let summary = Self.summary(from: teamRun)
        if let index = summaries.firstIndex(where: { $0.teamRunId == teamRun.id }) {
            summaries[index] = summary
        } else {
            summaries.append(summary)
        }
        summaries = Self.sorted(summaries)
    }

    public mutating func setSummaries(_ summaries: [TeamRunSummary]) {
        self.summaries = Self.sorted(summaries)
        if let selectedId, self.summaries.contains(where: { $0.teamRunId == selectedId }) {
            return
        }

        selectedId = latest?.teamRunId
        if current?.id != selectedId {
            current = nil
        }
    }

    private static func sorted(_ summaries: [TeamRunSummary]) -> [TeamRunSummary] {
        summaries.sorted { left, right in
            if left.createdAt != right.createdAt {
                return left.createdAt > right.createdAt
            }
            return left.teamRunId < right.teamRunId
        }
    }

    private static func summary(from teamRun: TeamRun) -> TeamRunSummary {
        TeamRunSummary(
            teamRunId: teamRun.id,
            projectId: teamRun.projectId,
            status: teamRun.status,
            createdAt: teamRun.createdAt,
            updatedAt: teamRun.updatedAt,
            roleCount: teamRun.roles.count,
            completedRoleCount: teamRun.roles.filter { $0.status == "completed" }.count
        )
    }
}
