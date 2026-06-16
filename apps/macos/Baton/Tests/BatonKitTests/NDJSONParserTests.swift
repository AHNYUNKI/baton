import XCTest
@testable import BatonKit

final class NDJSONParserTests: XCTestCase {
    func testParsesMultipleCompleteLines() throws {
        var parser = NDJSONParser()
        let events = try parser.append(
            eventLine(runId: "run-a", status: "running")
                + "\n"
                + eventLine(runId: "run-b", status: "completed")
                + "\n"
        )

        XCTAssertEqual(events.map(\.runId), ["run-a", "run-b"])
        XCTAssertEqual(events.map(\.status), [.running, .completed])
        XCTAssertEqual(try parser.finish(), [])
    }

    func testBuffersPartialLineUntilNewline() throws {
        var parser = NDJSONParser()
        let line = eventLine(runId: "run-a", status: "running")
        let splitIndex = line.index(line.startIndex, offsetBy: 25)

        XCTAssertEqual(try parser.append(String(line[..<splitIndex])), [])
        let events = try parser.append(String(line[splitIndex...]) + "\n")

        XCTAssertEqual(events.map(\.runId), ["run-a"])
    }

    func testIgnoresBlankLinesAndFinishesTrailingLine() throws {
        var parser = NDJSONParser()
        let first = try parser.append("\n  \n")
        let trailing = try parser.append(eventLine(runId: "run-c", status: "failed"))
        let finished = try parser.finish()

        XCTAssertEqual(first, [])
        XCTAssertEqual(trailing, [])
        XCTAssertEqual(finished.map(\.runId), ["run-c"])
    }

    func testRejectsNonEventEnvelopeKind() throws {
        var parser = NDJSONParser()

        XCTAssertThrowsError(try parser.append(#"{"schemaVersion":1,"kind":"state","data":{"total":0,"byStatus":{},"recent":[]}}"# + "\n")) { error in
            XCTAssertEqual(error as? NDJSONParserError, .unexpectedEnvelopeKind(expected: "event", actual: "state"))
        }
    }

    private func eventLine(runId: String, status: String) -> String {
        #"{"schemaVersion":1,"kind":"event","data":{"type":"run.created","runId":"\#(runId)","status":"\#(status)","run":{"runId":"\#(runId)","status":"\#(status)","dryRun":false,"workflowId":"default","createdAt":"2026-06-15T00:00:00.000Z","stepCount":1}}}"#
    }
}
