import XCTest
@testable import BatonKit

final class TeamRunStreamModelTests: XCTestCase {
    func testApplyAccumulatesOutputAndTracksCurrentRoleAndFinalRun() {
        var model = TeamRunStreamModel()
        let finalRun = teamRun(status: "completed")

        model.apply(.event(TeamRunStreamEvent(type: "teamRun.role.started", roleId: "lead")))
        model.apply(.event(TeamRunStreamEvent(type: "teamRun.role.output", roleId: "lead", chunk: "hello")))
        model.apply(.event(TeamRunStreamEvent(type: "teamRun.role.output", roleId: "lead", chunk: " world")))
        model.apply(.event(TeamRunStreamEvent(type: "teamRun.role.completed", roleId: "lead")))
        model.apply(.event(TeamRunStreamEvent(type: "teamRun.unknown", roleId: "lead", chunk: "ignored")))
        model.apply(.final(finalRun))

        XCTAssertEqual(model.currentRoleId, "lead")
        XCTAssertEqual(model.outputByRole, ["lead": "hello world"])
        XCTAssertEqual(model.final, finalRun)
    }

    func testResetClearsState() {
        var model = TeamRunStreamModel(
            outputByRole: ["lead": "hello"],
            currentRoleId: "lead",
            final: teamRun(status: "completed")
        )

        model.reset()

        XCTAssertEqual(model, TeamRunStreamModel())
    }

    func testReducerIsDeterministicForSameInputs() {
        let inputs: [TeamRunStreamItem] = [
            .event(TeamRunStreamEvent(type: "teamRun.role.started", roleId: "lead")),
            .event(TeamRunStreamEvent(type: "teamRun.role.output", roleId: "lead", chunk: "a")),
            .event(TeamRunStreamEvent(type: "teamRun.role.output", roleId: "lead", chunk: "b")),
            .final(teamRun(status: "completed"))
        ]

        var first = TeamRunStreamModel()
        var second = TeamRunStreamModel()
        for item in inputs {
            first.apply(item)
            second.apply(item)
        }

        XCTAssertEqual(first, second)
    }

    private func teamRun(status: String) -> TeamRun {
        TeamRun(
            id: "team-run-1",
            projectId: "project-1",
            status: status,
            createdAt: "2026-06-17T00:00:00.000Z",
            order: ["lead"],
            roles: [
                TeamRunRole(roleId: "lead", name: "Lead", assignedAgentId: "claude", status: "completed")
            ]
        )
    }
}
