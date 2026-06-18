import XCTest
@testable import BatonKit

final class BatonClientTeamRunTests: XCTestCase {
    func testListShowAndStartTeamRunBuildArgsAndDecodeEnvelopes() async throws {
        let runner = TeamRunClientFakeRunner(results: [
            .success(.json(Self.teamRunListEnvelope)),
            .success(.json(Self.teamRunEnvelope(id: "team-run-1", status: "running"))),
            .success(.json(Self.teamRunEnvelope(id: "team-run-2", status: "awaiting-approval")))
        ])
        let client = BatonClient(runner: runner)

        let list = try await client.listTeamRuns(projectId: "project-1")
        let shown = try await client.showTeamRun(teamRunId: "team-run-1")
        let started = try await client.startTeamRun(projectId: "project-1")

        XCTAssertEqual(list.teamRuns.map(\.teamRunId), ["team-run-1"])
        XCTAssertEqual(shown.status, "running")
        XCTAssertEqual(started.id, "team-run-2")
        XCTAssertEqual(runner.runCalls(), [
            ["project", "plan", "run", "list", "project-1", "--json"],
            ["project", "plan", "run", "show", "team-run-1", "--json"],
            ["project", "plan", "run", "start", "project-1", "--json"]
        ])
    }

    func testStartTeamRunBuildsOptInFlagsAndOptions() async throws {
        let runner = TeamRunClientFakeRunner(results: [
            .success(.json(Self.teamRunEnvelope(id: "team-run-1", status: "awaiting-approval")))
        ])
        let client = BatonClient(runner: runner)

        _ = try await client.startTeamRun(
            projectId: "project-1",
            options: StartTeamRunOptions(
                codex: true,
                claude: true,
                write: true,
                baseBranch: " origin/main ",
                timeoutMs: 1234
            )
        )

        XCTAssertEqual(runner.runCalls(), [
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
                "--json"
            ]
        ])
    }

    func testApproveRejectAndReviewTeamRunBuildArgsAndDecodeEnvelopes() async throws {
        let runner = TeamRunClientFakeRunner(results: [
            .success(.json(Self.teamRunEnvelope(id: "team-run-1", status: "running"))),
            .success(.json(Self.teamRunEnvelope(id: "team-run-1", status: "cancelled"))),
            .success(.json(Self.teamRunEnvelope(id: "team-run-1", status: "completed"))),
            .success(.json(Self.teamRunEnvelope(id: "team-run-1", status: "failed")))
        ])
        let client = BatonClient(runner: runner)

        let approved = try await client.approveTeamRun(teamRunId: "team-run-1", reject: false, note: "go")
        let rejected = try await client.approveTeamRun(teamRunId: "team-run-1", reject: true, note: "stop")
        let accepted = try await client.reviewTeamRun(teamRunId: "team-run-1", accept: true, note: "looks good")
        let reviewRejected = try await client.reviewTeamRun(teamRunId: "team-run-1", accept: false, note: nil)

        XCTAssertEqual(approved.status, "running")
        XCTAssertEqual(rejected.status, "cancelled")
        XCTAssertEqual(accepted.status, "completed")
        XCTAssertEqual(reviewRejected.status, "failed")
        XCTAssertEqual(runner.runCalls(), [
            ["project", "plan", "run", "approve", "team-run-1", "--note", "go", "--json"],
            ["project", "plan", "run", "reject", "team-run-1", "--note", "stop", "--json"],
            ["project", "plan", "run", "review", "team-run-1", "--accept", "--note", "looks good", "--json"],
            ["project", "plan", "run", "review", "team-run-1", "--reject", "--json"]
        ])
    }

    private static let teamRunListEnvelope = """
    {"schemaVersion":1,"kind":"team-run-list","data":{"teamRuns":[{"teamRunId":"team-run-1","projectId":"project-1","status":"running","createdAt":"2026-06-17T00:00:00.000Z","roleCount":2,"completedRoleCount":1}]}}
    """

    private static func teamRunEnvelope(id: String, status: String) -> String {
        """
        {"schemaVersion":1,"kind":"team-run","data":{"id":"\(id)","projectId":"project-1","status":"\(status)","createdAt":"2026-06-17T00:00:00.000Z","order":["lead"],"roles":[{"roleId":"lead","name":"Lead","assignedAgentId":"claude","status":"planned"}]}}
        """
    }
}

private final class TeamRunClientFakeRunner: CommandRunner, @unchecked Sendable {
    private let lock = NSLock()
    private var results: [Result<CommandResult, Error>]
    private var recordedRunCalls: [[String]]

    init(results: [Result<CommandResult, Error>]) {
        self.results = results
        self.recordedRunCalls = []
    }

    func run(arguments: [String]) async throws -> CommandResult {
        try dequeueRunResult(arguments: arguments).get()
    }

    private func dequeueRunResult(arguments: [String]) -> Result<CommandResult, Error> {
        lock.lock()
        recordedRunCalls.append(arguments)
        let result = results.isEmpty ? .success(.ok) : results.removeFirst()
        lock.unlock()
        return result
    }

    func stream(arguments: [String]) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            continuation.finish()
        }
    }

    func runCalls() -> [[String]] {
        lock.lock()
        let snapshot = recordedRunCalls
        lock.unlock()
        return snapshot
    }
}

private extension CommandResult {
    static let ok = CommandResult(stdout: "", stderr: "", exitCode: 0, durationMs: 1)

    static func json(_ stdout: String) -> CommandResult {
        CommandResult(stdout: stdout, stderr: "", exitCode: 0, durationMs: 1)
    }
}
