import XCTest
@testable import BatonKit

final class TeamRunMonitorModelTests: XCTestCase {
    func testLatestAndSelectedDefaultToNewestCreatedAt() {
        let model = TeamRunMonitorModel(summaries: [
            summary(id: "team-run-old", createdAt: "2026-06-17T00:00:00.000Z"),
            summary(id: "team-run-new", createdAt: "2026-06-17T00:02:00.000Z")
        ])

        XCTAssertEqual(model.latest?.teamRunId, "team-run-new")
        XCTAssertEqual(model.selected?.teamRunId, "team-run-new")
        XCTAssertEqual(model.selectedId, "team-run-new")
        XCTAssertEqual(model.summaries.map(\.teamRunId), ["team-run-new", "team-run-old"])
    }

    func testCanApproveCanReviewAndStatusByRoleFollowCurrentRun() {
        var model = TeamRunMonitorModel()

        model.setCurrent(teamRun(id: "team-run-1", status: "awaiting-approval", roleStatus: "planned"))
        XCTAssertTrue(model.canApprove)
        XCTAssertFalse(model.canReview)
        XCTAssertEqual(model.statusByRole, ["lead": "planned"])

        model.setCurrent(teamRun(id: "team-run-1", status: "awaiting-review", roleStatus: "completed"))
        XCTAssertFalse(model.canApprove)
        XCTAssertTrue(model.canReview)
        XCTAssertEqual(model.statusByRole, ["lead": "completed"])
    }

    func testSelectClearsStaleCurrentAndSetSummariesKeepsValidSelection() {
        var model = TeamRunMonitorModel(summaries: [
            summary(id: "team-run-1", createdAt: "2026-06-17T00:00:00.000Z"),
            summary(id: "team-run-2", createdAt: "2026-06-17T00:02:00.000Z")
        ])

        model.setCurrent(teamRun(id: "team-run-2", status: "running", roleStatus: "running"))
        model.select(id: "team-run-1")

        XCTAssertEqual(model.selectedId, "team-run-1")
        XCTAssertNil(model.current)
        XCTAssertEqual(model.statusByRole, [:])

        model.setSummaries([
            summary(id: "team-run-1", createdAt: "2026-06-17T00:00:00.000Z"),
            summary(id: "team-run-3", createdAt: "2026-06-17T00:03:00.000Z")
        ])
        XCTAssertEqual(model.selectedId, "team-run-1")

        model.setSummaries([
            summary(id: "team-run-3", createdAt: "2026-06-17T00:03:00.000Z")
        ])
        XCTAssertEqual(model.selectedId, "team-run-3")
    }

    private func summary(id: String, createdAt: String) -> TeamRunSummary {
        TeamRunSummary(
            teamRunId: id,
            projectId: "project-1",
            status: "running",
            createdAt: createdAt,
            roleCount: 1,
            completedRoleCount: 0
        )
    }

    private func teamRun(id: String, status: String, roleStatus: String) -> TeamRun {
        TeamRun(
            id: id,
            projectId: "project-1",
            status: status,
            createdAt: "2026-06-17T00:02:00.000Z",
            order: ["lead"],
            roles: [
                TeamRunRole(roleId: "lead", name: "Lead", assignedAgentId: "claude", status: roleStatus)
            ]
        )
    }
}
