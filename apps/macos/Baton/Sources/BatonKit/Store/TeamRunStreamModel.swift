import Foundation

public struct TeamRunStreamModel: Equatable, Sendable {
    public private(set) var outputByRole: [String: String]
    public private(set) var currentRoleId: String?
    public private(set) var final: TeamRun?

    public init(
        outputByRole: [String: String] = [:],
        currentRoleId: String? = nil,
        final: TeamRun? = nil
    ) {
        self.outputByRole = outputByRole
        self.currentRoleId = currentRoleId
        self.final = final
    }

    public mutating func apply(_ item: TeamRunStreamItem) {
        switch item {
        case let .event(event):
            apply(event)
        case let .final(teamRun):
            final = teamRun
        }
    }

    public mutating func reset() {
        outputByRole.removeAll()
        currentRoleId = nil
        final = nil
    }

    private mutating func apply(_ event: TeamRunStreamEvent) {
        switch event.type {
        case "teamRun.role.started":
            currentRoleId = event.roleId
        case "teamRun.role.output":
            guard let roleId = event.roleId, let chunk = event.chunk else {
                return
            }
            outputByRole[roleId, default: ""].append(chunk)
        default:
            break
        }
    }
}
