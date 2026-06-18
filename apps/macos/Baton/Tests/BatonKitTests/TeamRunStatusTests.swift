import XCTest
@testable import BatonKit

final class TeamRunStatusTests: XCTestCase {
    func testTeamRunStatusByRoleMapsRoleIdsToStatuses() {
        let teamRun = makeTeamRun(roles: [
            TeamRunRole(roleId: "lead", name: "Lead", assignedAgentId: "claude", status: "completed"),
            TeamRunRole(roleId: "implementer", name: "Implementer", assignedAgentId: "codex", status: "running")
        ])

        XCTAssertEqual(teamRunStatusByRole(teamRun), [
            "lead": "completed",
            "implementer": "running"
        ])
    }

    func testTeamRunStatusLabelReturnsKoreanLabels() {
        XCTAssertEqual(teamRunStatusLabel("planned"), "계획됨")
        XCTAssertEqual(teamRunStatusLabel("running"), "진행 중")
        XCTAssertEqual(teamRunStatusLabel("awaiting-approval"), "승인 대기")
        XCTAssertEqual(teamRunStatusLabel("awaiting-review"), "검토 대기")
        XCTAssertEqual(teamRunStatusLabel("completed"), "완료")
        XCTAssertEqual(teamRunStatusLabel("failed"), "실패")
        XCTAssertEqual(teamRunStatusLabel("cancelled"), "취소됨")
        XCTAssertEqual(teamRunStatusLabel("skipped"), "건너뜀")
        XCTAssertEqual(teamRunStatusLabel("custom"), "custom")
    }

    private func makeTeamRun(roles: [TeamRunRole]) -> TeamRun {
        TeamRun(
            id: "team-run-1",
            projectId: "project-1",
            status: "running",
            createdAt: "2026-06-17T00:00:00.000Z",
            order: roles.map(\.roleId),
            roles: roles
        )
    }
}
