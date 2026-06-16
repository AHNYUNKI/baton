import Foundation

public enum WorkflowStepType: String, Codable, Sendable {
    case analyze
    case design
    case approve
    case implement
    case test
    case review
    case fix
    case finalize
}

public enum RunStepStatus: String, Codable, Sendable {
    case planned
    case running
    case completed
    case failed
    case skipped
}

public enum ApprovalStatus: String, Codable, Sendable {
    case pending
    case approved
    case rejected
}

public struct RunStep: Codable, Equatable, Hashable, Identifiable, Sendable {
    public let id: String
    public let type: WorkflowStepType
    public let status: RunStepStatus
    public let startedAt: String?
    public let completedAt: String?
    public let reason: String?
    public let artifacts: [String]?
    public let attempts: Int?

    public init(
        id: String,
        type: WorkflowStepType,
        status: RunStepStatus,
        startedAt: String? = nil,
        completedAt: String? = nil,
        reason: String? = nil,
        artifacts: [String]? = nil,
        attempts: Int? = nil
    ) {
        self.id = id
        self.type = type
        self.status = status
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.reason = reason
        self.artifacts = artifacts
        self.attempts = attempts
    }
}

public struct Approval: Codable, Equatable, Hashable, Sendable {
    public let runId: String
    public let stepId: String
    public let status: ApprovalStatus
    public let createdAt: String
    public let decidedAt: String?
    public let note: String?

    public init(
        runId: String,
        stepId: String,
        status: ApprovalStatus,
        createdAt: String,
        decidedAt: String? = nil,
        note: String? = nil
    ) {
        self.runId = runId
        self.stepId = stepId
        self.status = status
        self.createdAt = createdAt
        self.decidedAt = decidedAt
        self.note = note
    }
}

public struct RunRecord: Codable, Equatable, Hashable, Identifiable, Sendable {
    public let id: String
    public let request: String
    public let workflowId: String
    public let projectId: String?
    public let status: RunStatus
    public let dryRun: Bool
    public let createdAt: String
    public let steps: [RunStep]
    public let worktreePath: String?
    public let baseBranch: String?
    public let updatedAt: String?
    public let cleanedAt: String?
    public let approvals: [Approval]?

    public init(
        id: String,
        request: String,
        workflowId: String,
        projectId: String? = nil,
        status: RunStatus,
        dryRun: Bool,
        createdAt: String,
        steps: [RunStep],
        worktreePath: String? = nil,
        baseBranch: String? = nil,
        updatedAt: String? = nil,
        cleanedAt: String? = nil,
        approvals: [Approval]? = nil
    ) {
        self.id = id
        self.request = request
        self.workflowId = workflowId
        self.projectId = projectId
        self.status = status
        self.dryRun = dryRun
        self.createdAt = createdAt
        self.steps = steps
        self.worktreePath = worktreePath
        self.baseBranch = baseBranch
        self.updatedAt = updatedAt
        self.cleanedAt = cleanedAt
        self.approvals = approvals
    }
}

public struct RunDetail: Codable, Equatable, Sendable {
    public let run: RunRecord
    public let artifacts: [String]

    public init(run: RunRecord, artifacts: [String]) {
        self.run = run
        self.artifacts = artifacts
    }
}
