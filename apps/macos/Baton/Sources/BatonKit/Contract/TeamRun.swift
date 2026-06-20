import Foundation

public struct TeamRunRoleUsage: Codable, Equatable, Sendable {
    public let inputTokens: Int
    public let outputTokens: Int
    public let estimated: Bool

    public init(inputTokens: Int, outputTokens: Int, estimated: Bool) {
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.estimated = estimated
    }
}

public struct TeamRunRole: Codable, Equatable, Identifiable, Sendable {
    public let roleId: String
    public let name: String
    public let assignedAgentId: String
    public let status: String
    public let startedAt: String?
    public let completedAt: String?
    public let reason: String?
    public let explanation: String?
    public let summary: String?
    public let usage: TeamRunRoleUsage?
    public let artifacts: [String]?

    public var id: String { roleId }

    public init(
        roleId: String,
        name: String,
        assignedAgentId: String,
        status: String,
        startedAt: String? = nil,
        completedAt: String? = nil,
        reason: String? = nil,
        explanation: String? = nil,
        summary: String? = nil,
        usage: TeamRunRoleUsage? = nil,
        artifacts: [String]? = nil
    ) {
        self.roleId = roleId
        self.name = name
        self.assignedAgentId = assignedAgentId
        self.status = status
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.reason = reason
        self.explanation = explanation
        self.summary = summary
        self.usage = usage
        self.artifacts = artifacts
    }
}

public struct TeamRun: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let projectId: String
    public let status: String
    public let createdAt: String
    public let updatedAt: String?
    public let order: [String]
    public let roles: [TeamRunRole]
    public let worktreePath: String?
    public let baseBranch: String?
    public let diffSummary: String?
    public let approvals: [Approval]?

    public init(
        id: String,
        projectId: String,
        status: String,
        createdAt: String,
        updatedAt: String? = nil,
        order: [String],
        roles: [TeamRunRole],
        worktreePath: String? = nil,
        baseBranch: String? = nil,
        diffSummary: String? = nil,
        approvals: [Approval]? = nil
    ) {
        self.id = id
        self.projectId = projectId
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.order = order
        self.roles = roles
        self.worktreePath = worktreePath
        self.baseBranch = baseBranch
        self.diffSummary = diffSummary
        self.approvals = approvals
    }
}

public struct TeamRunSummary: Codable, Equatable, Identifiable, Sendable {
    public let teamRunId: String
    public let projectId: String
    public let status: String
    public let createdAt: String
    public let updatedAt: String?
    public let roleCount: Int?
    public let completedRoleCount: Int?

    public var id: String { teamRunId }

    public init(
        teamRunId: String,
        projectId: String,
        status: String,
        createdAt: String,
        updatedAt: String? = nil,
        roleCount: Int? = nil,
        completedRoleCount: Int? = nil
    ) {
        self.teamRunId = teamRunId
        self.projectId = projectId
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.roleCount = roleCount
        self.completedRoleCount = completedRoleCount
    }
}

public struct TeamRunList: Codable, Equatable, Sendable {
    public let teamRuns: [TeamRunSummary]

    public init(teamRuns: [TeamRunSummary]) {
        self.teamRuns = teamRuns
    }
}
