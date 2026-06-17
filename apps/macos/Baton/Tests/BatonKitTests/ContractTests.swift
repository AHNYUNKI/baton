import XCTest
@testable import BatonKit

final class ContractTests: XCTestCase {
    func testDecodesActualEmptyRunListSnapshot() throws {
        let envelope = try decodeFixture("actual-run-list-empty.json", as: JsonEnvelope<RunList>.self)

        XCTAssertEqual(envelope.schemaVersion, 1)
        XCTAssertEqual(envelope.kind, "run-list")
        XCTAssertEqual(envelope.data.runs, [])
        XCTAssertEqual(envelope.data.skipped, 13)
    }

    func testDecodesRunListAndOptionalFields() throws {
        let envelope = try decodeFixture("run-list.json", as: JsonEnvelope<RunList>.self)

        XCTAssertEqual(envelope.kind, "run-list")
        XCTAssertEqual(envelope.data.runs.count, 2)
        XCTAssertEqual(envelope.data.runs[0].runId, "completed-new")
        XCTAssertEqual(envelope.data.runs[0].outcome, .completed)
        XCTAssertNil(envelope.data.runs[1].updatedAt)
        XCTAssertNil(envelope.data.runs[1].outcome)
    }

    func testDecodesRunDetailEnvelope() throws {
        let envelope = try decodeFixture("run-detail.json", as: JsonEnvelope<RunDetail>.self)

        XCTAssertEqual(envelope.kind, "run-detail")
        XCTAssertEqual(envelope.data.run.id, "run-1")
        XCTAssertEqual(envelope.data.run.steps.first?.type, .implement)
        XCTAssertEqual(envelope.data.run.approvals?.first?.status, .approved)
        XCTAssertEqual(envelope.data.artifacts, ["logs/codex.stdout.log", "request.md", "run.json"])
    }

    func testDecodesStateEnvelope() throws {
        let envelope = try decodeFixture("state.json", as: JsonEnvelope<StateSnapshot>.self)

        XCTAssertEqual(envelope.kind, "state")
        XCTAssertEqual(envelope.data.total, 2)
        XCTAssertEqual(envelope.data.byStatus["running"], 1)
        XCTAssertEqual(envelope.data.recent.map(\.runId), ["completed-new", "running-old"])
    }

    func testDecodesProjectListEnvelope() throws {
        let json = """
        {"schemaVersion":1,"kind":"project-list","data":[{"id":"project-1","name":"Baton","source":{"kind":"local","value":"/tmp/baton"},"agentIds":["codex"],"leadAgentId":"codex","createdAt":"2026-06-15T00:00:00.000Z"}]}
        """

        let envelope = try JSONDecoder().decode(JsonEnvelope<[Project]>.self, from: Data(json.utf8))

        XCTAssertEqual(envelope.kind, "project-list")
        XCTAssertEqual(envelope.data.first?.source.kind, .local)
        XCTAssertEqual(envelope.data.first?.agentIds, ["codex"])
    }

    func testDecodesWatchEventNDJSONFixture() throws {
        let text = try fixtureText("watch-events.ndjson")
        let envelopes = try text
            .split(separator: "\n")
            .map { try JSONDecoder().decode(JsonEnvelope<WatchEvent>.self, from: Data($0.utf8)) }

        XCTAssertEqual(envelopes.map(\.kind), ["event", "event"])
        XCTAssertEqual(envelopes.map(\.data.type), [.created, .updated])
        XCTAssertEqual(envelopes[0].data.run?.runId, "run-a")
        XCTAssertEqual(envelopes[1].data.previousUpdatedAt, "2026-06-15T00:00:00.000Z")
    }

    func testRejectsUnsupportedSchemaVersion() throws {
        XCTAssertThrowsError(try decodeFixture("unsupported-version.json", as: JsonEnvelope<RunList>.self)) { error in
            XCTAssertEqual(
                error as? BatonContractError,
                .unsupportedSchemaVersion(expected: 1, actual: 2)
            )
        }
    }

    private func decodeFixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        try JSONDecoder().decode(type, from: fixtureData(name))
    }

    private func fixtureData(_ name: String) throws -> Data {
        guard let url = Bundle.module.url(forResource: name, withExtension: nil) else {
            XCTFail("Missing fixture \(name)")
            return Data()
        }
        return try Data(contentsOf: url)
    }

    private func fixtureText(_ name: String) throws -> String {
        String(decoding: try fixtureData(name), as: UTF8.self)
    }
}
