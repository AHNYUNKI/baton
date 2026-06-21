import XCTest
@testable import BatonKit

final class BatonClientStreamTests: XCTestCase {
    func testStreamTeamRunApproveBuildsApproveAndRejectArgsAndDecodesItems() async throws {
        let runner = TeamRunStreamClientFakeRunner(streamChunks: Self.streamChunks())
        let client = BatonClient(runner: runner)

        let approved = try await collect(client.streamTeamRunApprove(teamRunId: "team-run-1", note: "go"))
        let rejected = try await collect(client.streamTeamRunApprove(teamRunId: "team-run-1", reject: true, note: "stop"))

        XCTAssertEqual(approved, Self.expectedItems())
        XCTAssertEqual(rejected, Self.expectedItems())
        XCTAssertEqual(runner.streamCalls(), [
            ["project", "plan", "run", "approve", "team-run-1", "--note", "go", "--stream", "--json"],
            ["project", "plan", "run", "reject", "team-run-1", "--note", "stop", "--stream", "--json"]
        ])
    }

    func testStreamTeamRunContinueBuildsArgsAndDecodesItems() async throws {
        let runner = TeamRunStreamClientFakeRunner(streamChunks: Self.streamChunks())
        let client = BatonClient(runner: runner)

        let continued = try await collect(client.streamTeamRunContinue(teamRunId: "team-run-1", note: "go"))
        let rejected = try await collect(client.streamTeamRunContinue(teamRunId: "team-run-1", reject: true, note: "stop"))

        XCTAssertEqual(continued, Self.expectedItems())
        XCTAssertEqual(rejected, Self.expectedItems())
        XCTAssertEqual(runner.streamCalls(), [
            ["project", "plan", "run", "continue", "team-run-1", "--note", "go", "--stream", "--json"],
            ["project", "plan", "run", "continue", "team-run-1", "--reject", "--note", "stop", "--stream", "--json"]
        ])
    }

    func testStreamTeamRunStartBuildsOptionsAndDecodesItems() async throws {
        let runner = TeamRunStreamClientFakeRunner(streamChunks: Self.streamChunks())
        let client = BatonClient(runner: runner)

        let items = try await collect(
            client.streamTeamRunStart(
                projectId: "project-1",
                options: StartTeamRunOptions(
                    codex: true,
                    claude: true,
                    write: true,
                    baseBranch: " origin/main ",
                    timeoutMs: 1234
                )
            )
        )

        XCTAssertEqual(items, Self.expectedItems())
        XCTAssertEqual(runner.streamCalls(), [
            [
                "project",
                "plan",
                "run",
                "start",
                "project-1",
                "--codex",
                "--claude",
                "--write",
                "--base",
                "origin/main",
                "--timeout-ms",
                "1234",
                "--stream",
                "--json"
            ]
        ])
    }

    func testStreamErrorsAreMappedToBatonClientErrors() async throws {
        let runner = TeamRunStreamClientFakeRunner(
            streamChunks: [],
            streamError: CommandRunnerError.nonZeroExit(arguments: ["project"], exitCode: 2, stderr: "boom")
        )
        let client = BatonClient(runner: runner)

        do {
            _ = try await collect(client.streamTeamRunContinue(teamRunId: "team-run-1"))
            XCTFail("Expected stream error")
        } catch let error as BatonClientError {
            XCTAssertEqual(error, .commandFailed(arguments: ["project"], exitCode: 2, stderr: "boom"))
        }
    }

    private func collect(_ stream: AsyncThrowingStream<TeamRunStreamItem, Error>) async throws -> [TeamRunStreamItem] {
        var items: [TeamRunStreamItem] = []
        for try await item in stream {
            items.append(item)
        }
        return items
    }

    private static func streamChunks() -> [String] {
        [
            eventLine(type: "teamRun.role.started", roleId: "lead") + "\n",
            eventLine(type: "teamRun.role.output", roleId: "lead", chunk: "hi "),
            "\n" + teamRunLine(status: "completed")
        ]
    }

    private static func expectedItems() -> [TeamRunStreamItem] {
        [
            .event(TeamRunStreamEvent(type: "teamRun.role.started", roleId: "lead")),
            .event(TeamRunStreamEvent(type: "teamRun.role.output", roleId: "lead", chunk: "hi ")),
            .final(teamRun(status: "completed"))
        ]
    }

    private static func eventLine(type: String, roleId: String, chunk: String? = nil) -> String {
        var fields = #""type":"\#(type)","roleId":"\#(roleId)""#
        if let chunk {
            fields += #","chunk":"\#(chunk)""#
        }
        return #"{"schemaVersion":1,"kind":"event","data":{\#(fields)}}"#
    }

    private static func teamRunLine(status: String) -> String {
        #"{"schemaVersion":1,"kind":"team-run","data":{"id":"team-run-1","projectId":"project-1","status":"\#(status)","createdAt":"2026-06-17T00:00:00.000Z","order":["lead"],"roles":[{"roleId":"lead","name":"Lead","assignedAgentId":"claude","status":"completed"}]}}"#
    }

    private static func teamRun(status: String) -> TeamRun {
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

private final class TeamRunStreamClientFakeRunner: CommandRunner, @unchecked Sendable {
    private let lock = NSLock()
    private let streamChunksStorage: [String]
    private let streamError: Error?
    private var recordedStreamCalls: [[String]]

    init(streamChunks: [String], streamError: Error? = nil) {
        self.streamChunksStorage = streamChunks
        self.streamError = streamError
        self.recordedStreamCalls = []
    }

    func run(arguments: [String]) async throws -> CommandResult {
        return CommandResult(stdout: "", stderr: "", exitCode: 0, durationMs: 1)
    }

    func stream(arguments: [String]) -> AsyncThrowingStream<String, Error> {
        lock.lock()
        recordedStreamCalls.append(arguments)
        let chunks = streamChunksStorage
        let error = streamError
        lock.unlock()

        return AsyncThrowingStream { continuation in
            for chunk in chunks {
                continuation.yield(chunk)
            }
            if let error {
                continuation.finish(throwing: error)
            } else {
                continuation.finish()
            }
        }
    }

    func streamCalls() -> [[String]] {
        lock.lock()
        let snapshot = recordedStreamCalls
        lock.unlock()
        return snapshot
    }
}
