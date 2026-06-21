import XCTest
@testable import BatonKit

final class TeamRunStreamEventTests: XCTestCase {
    func testDecodesOutputEventEnvelopeDataAndIgnoresAdditionalFields() throws {
        let envelope = try JSONDecoder().decode(
            JsonEnvelope<TeamRunStreamEvent>.self,
            from: Data(
                """
                {"schemaVersion":1,"kind":"event","data":{"type":"teamRun.role.output","roleId":"implementer","chunk":"hello","ignored":true}}
                """.utf8
            )
        )

        XCTAssertEqual(envelope.kind, "event")
        XCTAssertEqual(
            envelope.data,
            TeamRunStreamEvent(type: "teamRun.role.output", roleId: "implementer", chunk: "hello")
        )
        XCTAssertEqual(
            TeamRunStreamItem.event(envelope.data),
            .event(TeamRunStreamEvent(type: "teamRun.role.output", roleId: "implementer", chunk: "hello"))
        )
    }

    func testDecodesStartedAndCompletedEventsWithoutChunks() throws {
        let started = try decodeEvent(
            """
            {"schemaVersion":1,"kind":"event","data":{"type":"teamRun.role.started","roleId":"analyst"}}
            """
        )
        let completed = try decodeEvent(
            """
            {"schemaVersion":1,"kind":"event","data":{"type":"teamRun.role.completed","roleId":"analyst"}}
            """
        )

        XCTAssertEqual(started, TeamRunStreamEvent(type: "teamRun.role.started", roleId: "analyst"))
        XCTAssertEqual(completed, TeamRunStreamEvent(type: "teamRun.role.completed", roleId: "analyst"))
    }

    private func decodeEvent(_ json: String) throws -> TeamRunStreamEvent {
        try JSONDecoder()
            .decode(JsonEnvelope<TeamRunStreamEvent>.self, from: Data(json.utf8))
            .data
    }
}
