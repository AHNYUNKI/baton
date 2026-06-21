import XCTest
@testable import BatonKit

final class TeamRunStreamParserTests: XCTestCase {
    func testParsesEventAndFinalLinesInOrder() {
        var parser = TeamRunStreamParser()
        let finalRun = teamRun(status: "completed")

        let items = parser.append(
            eventLine(type: "teamRun.role.started", roleId: "lead") + "\n"
                + eventLine(type: "teamRun.role.output", roleId: "lead", chunk: "hello") + "\n"
                + teamRunLine(status: finalRun.status) + "\n"
        )

        XCTAssertEqual(
            items,
            [
                .event(TeamRunStreamEvent(type: "teamRun.role.started", roleId: "lead")),
                .event(TeamRunStreamEvent(type: "teamRun.role.output", roleId: "lead", chunk: "hello")),
                .final(finalRun)
            ]
        )
        XCTAssertEqual(parser.finish(), [])
    }

    func testBuffersPartialLineUntilNextChunk() {
        var parser = TeamRunStreamParser()
        let line = eventLine(type: "teamRun.role.output", roleId: "lead", chunk: "partial")
        let splitIndex = line.index(line.startIndex, offsetBy: 30)

        XCTAssertEqual(parser.append(String(line[..<splitIndex])), [])

        let items = parser.append(String(line[splitIndex...]) + "\n")

        XCTAssertEqual(
            items,
            [.event(TeamRunStreamEvent(type: "teamRun.role.output", roleId: "lead", chunk: "partial"))]
        )
    }

    func testSkipsUnknownKindsAndInvalidLines() {
        var parser = TeamRunStreamParser()

        let items = parser.append(
            #"{"schemaVersion":1,"kind":"state","data":{"total":0}}"# + "\n"
                + "not json\n"
                + #"{"schemaVersion":2,"kind":"event","data":{"type":"teamRun.role.started","roleId":"lead"}}"# + "\n"
                + eventLine(type: "teamRun.role.completed", roleId: "lead") + "\n"
        )

        XCTAssertEqual(items, [.event(TeamRunStreamEvent(type: "teamRun.role.completed", roleId: "lead"))])
    }

    func testFinishDecodesTrailingLineAndClearsBuffer() {
        var parser = TeamRunStreamParser()

        XCTAssertEqual(parser.append(eventLine(type: "teamRun.role.output", roleId: "lead", chunk: "tail")), [])
        XCTAssertEqual(
            parser.finish(),
            [.event(TeamRunStreamEvent(type: "teamRun.role.output", roleId: "lead", chunk: "tail"))]
        )
        XCTAssertEqual(parser.finish(), [])
    }

    private func eventLine(type: String, roleId: String, chunk: String? = nil) -> String {
        var fields = #""type":"\#(type)","roleId":"\#(roleId)""#
        if let chunk {
            fields += #","chunk":"\#(chunk)""#
        }
        return #"{"schemaVersion":1,"kind":"event","data":{\#(fields)}}"#
    }

    private func teamRunLine(status: String) -> String {
        #"{"schemaVersion":1,"kind":"team-run","data":{"id":"team-run-1","projectId":"project-1","status":"\#(status)","createdAt":"2026-06-17T00:00:00.000Z","order":["lead"],"roles":[{"roleId":"lead","name":"Lead","assignedAgentId":"claude","status":"completed"}]}}"#
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
