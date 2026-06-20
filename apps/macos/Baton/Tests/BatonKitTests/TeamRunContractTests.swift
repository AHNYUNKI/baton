import XCTest
@testable import BatonKit

final class TeamRunContractTests: XCTestCase {
    func testDecodesTeamRunEnvelopeWithUsageDiffAndMissingOptionals() throws {
        let envelope = try decodeFixture("team-run.json", as: JsonEnvelope<TeamRun>.self)

        XCTAssertEqual(envelope.schemaVersion, 1)
        XCTAssertEqual(envelope.kind, "team-run")
        XCTAssertEqual(envelope.data.id, "team-run-1")
        XCTAssertEqual(envelope.data.status, "awaiting-review")
        XCTAssertEqual(envelope.data.diffSummary, "1 file changed, 2 insertions(+)")
        XCTAssertEqual(envelope.data.roles.map(\.roleId), ["lead", "implementer"])
        XCTAssertEqual(envelope.data.roles.first?.usage, TeamRunRoleUsage(inputTokens: 12, outputTokens: 7, estimated: false))
        XCTAssertNil(envelope.data.roles.first?.explanation)
        XCTAssertNil(envelope.data.roles[1].startedAt)
        XCTAssertNil(envelope.data.roles[1].usage)
        XCTAssertEqual(envelope.data.approvals?.first?.stepId, "post-run-review")
    }

    func testDecodesCheckpointTeamRunEnvelopeWithExplanationAndExtraFields() throws {
        let envelope = try decodeFixture("team-run-checkpoint.json", as: JsonEnvelope<TeamRun>.self)

        XCTAssertEqual(envelope.kind, "team-run")
        XCTAssertEqual(envelope.data.id, "team-run-checkpoint")
        XCTAssertEqual(envelope.data.status, "awaiting-checkpoint")
        XCTAssertEqual(envelope.data.roles.first?.roleId, "analyst")
        XCTAssertEqual(
            envelope.data.roles.first?.explanation,
            "이 단계는 요구사항의 검토 기준을 먼저 정리해 이후 구현 범위를 작게 유지합니다."
        )
        XCTAssertNil(envelope.data.roles[1].explanation)
        XCTAssertEqual(envelope.data.approvals?.first?.stepId, "checkpoint:analyst")
        XCTAssertEqual(envelope.data.approvals?.first?.status, .pending)
    }

    func testDecodesTeamRunListEnvelopeWithSummaryCountsAsOptional() throws {
        let envelope = try decodeFixture("team-run-list.json", as: JsonEnvelope<TeamRunList>.self)

        XCTAssertEqual(envelope.kind, "team-run-list")
        XCTAssertEqual(envelope.data.teamRuns.map(\.teamRunId), ["team-run-2", "team-run-1"])
        XCTAssertEqual(envelope.data.teamRuns[0].roleCount, 2)
        XCTAssertEqual(envelope.data.teamRuns[0].completedRoleCount, 1)
        XCTAssertNil(envelope.data.teamRuns[1].roleCount)
        XCTAssertEqual(envelope.data.teamRuns[1].status, "awaiting-review")
    }

    private func decodeFixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        guard let url = Bundle.module.url(forResource: name, withExtension: nil) else {
            XCTFail("Missing fixture \(name)")
            return try JSONDecoder().decode(type, from: Data())
        }
        return try JSONDecoder().decode(type, from: Data(contentsOf: url))
    }
}
