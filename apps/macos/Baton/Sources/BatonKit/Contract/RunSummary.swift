import Foundation

public enum RunStatus: String, Codable, CaseIterable, Sendable {
    case planned
    case running
    case awaitingApproval = "awaiting-approval"
    case completed
    case failed
    case cancelled
}

public struct RunSummary: Codable, Equatable, Hashable, Identifiable, Sendable {
    public let runId: String
    public let status: RunStatus
    public let dryRun: Bool
    public let workflowId: String
    public let createdAt: String
    public let updatedAt: String?
    public let stepCount: Int
    public let outcome: RunStatus?

    public var id: String { runId }

    public init(
        runId: String,
        status: RunStatus,
        dryRun: Bool,
        workflowId: String,
        createdAt: String,
        updatedAt: String? = nil,
        stepCount: Int,
        outcome: RunStatus? = nil
    ) {
        self.runId = runId
        self.status = status
        self.dryRun = dryRun
        self.workflowId = workflowId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.stepCount = stepCount
        self.outcome = outcome
    }

    public func replacing(status: RunStatus? = nil, updatedAt: String? = nil) -> RunSummary {
        RunSummary(
            runId: runId,
            status: status ?? self.status,
            dryRun: dryRun,
            workflowId: workflowId,
            createdAt: createdAt,
            updatedAt: updatedAt ?? self.updatedAt,
            stepCount: stepCount,
            outcome: outcome
        )
    }
}

public struct RunList: Codable, Equatable, Sendable {
    public let runs: [RunSummary]
    public let skipped: Int

    public init(runs: [RunSummary], skipped: Int) {
        self.runs = runs
        self.skipped = skipped
    }
}
