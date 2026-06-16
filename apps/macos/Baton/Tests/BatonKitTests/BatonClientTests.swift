import XCTest
@testable import BatonKit

final class BatonClientTests: XCTestCase {
    func testListRunsBuildsArgvAndDecodesEnvelope() async throws {
        let runner = FakeCommandRunner(results: [
            .success(.json("""
            {"schemaVersion":1,"kind":"run-list","data":{"runs":[{"runId":"run-1","status":"running","dryRun":false,"workflowId":"default","createdAt":"2026-06-15T00:00:00.000Z","stepCount":1}],"skipped":0}}
            """))
        ])
        let client = BatonClient(runner: runner)

        let result = try await client.listRuns()

        XCTAssertEqual(result.runs.map(\.runId), ["run-1"])
        XCTAssertEqual(runner.runCalls(), [["run", "list", "--json"]])
    }

    func testRunDetailAndStateBuildArgvAndDecode() async throws {
        let runner = FakeCommandRunner(results: [
            .success(.json("""
            {"schemaVersion":1,"kind":"run-detail","data":{"run":{"id":"run-1","request":"Build","workflowId":"default","status":"completed","dryRun":false,"createdAt":"2026-06-15T00:00:00.000Z","steps":[]},"artifacts":["run.json"]}}
            """)),
            .success(.json("""
            {"schemaVersion":1,"kind":"state","data":{"total":1,"byStatus":{"planned":0,"running":0,"awaiting-approval":0,"completed":1,"failed":0,"cancelled":0},"recent":[]}}
            """))
        ])
        let client = BatonClient(runner: runner)

        let detail = try await client.runDetail(id: "run-1")
        let state = try await client.state()

        XCTAssertEqual(detail.run.id, "run-1")
        XCTAssertEqual(state.byStatus["completed"], 1)
        XCTAssertEqual(runner.runCalls(), [
            ["run", "show", "run-1", "--json"],
            ["state", "--json"]
        ])
    }

    func testMutationCommandsBuildArrayArguments() async throws {
        let runner = FakeCommandRunner(results: Array(repeating: .success(.ok), count: 5))
        let client = BatonClient(runner: runner)

        try await client.startRun(
            request: "Build Baton",
            options: StartRunOptions(
                dryRun: true,
                workflowId: "wf",
                projectId: "proj",
                useCodex: true,
                useClaude: false,
                useTest: true,
                testCommand: "pnpm test",
                fixEnabled: false,
                maxFixAttempts: 2
            )
        )
        try await client.approve(
            runId: "run-1",
            reject: true,
            note: "No",
            options: ResumeRunOptions(useCodex: true)
        )
        try await client.approve(runId: "run-1")
        try await client.resume(runId: "run-1", options: ResumeRunOptions(useTest: false))
        try await client.clean(runId: "run-1")

        XCTAssertEqual(runner.runCalls(), [
            ["run", "Build Baton", "--dry-run", "--codex", "--no-claude", "--test", "--test-command", "pnpm test", "--no-fix", "--max-fix-attempts", "2", "--workflow", "wf", "--project", "proj"],
            ["run", "approve", "run-1", "--codex", "--reject", "--note", "No"],
            ["run", "approve", "run-1"],
            ["run", "resume", "run-1", "--no-test"],
            ["run", "clean", "run-1"]
        ])
    }

    func testCommandFailuresAreClearErrors() async throws {
        let runner = FakeCommandRunner(results: [
            .success(CommandResult(stdout: "", stderr: "boom", exitCode: 2, durationMs: 1)),
            .success(CommandResult(stdout: "   ", stderr: "", exitCode: 0, durationMs: 1)),
            .failure(CommandRunnerError.executableNotFound("baton"))
        ])
        let client = BatonClient(runner: runner)

        do {
            _ = try await client.listRuns()
            XCTFail("Expected command failure")
        } catch let error as BatonClientError {
            XCTAssertEqual(error, .commandFailed(arguments: ["run", "list", "--json"], exitCode: 2, stderr: "boom"))
        }

        do {
            _ = try await client.listRuns()
            XCTFail("Expected empty output")
        } catch let error as BatonClientError {
            XCTAssertEqual(error, .emptyOutput(arguments: ["run", "list", "--json"]))
        }

        do {
            _ = try await client.listRuns()
            XCTFail("Expected missing baton")
        } catch let error as BatonClientError {
            XCTAssertEqual(error, .batonNotFound("baton"))
        }
    }

    func testUnexpectedEnvelopeKindIsRejected() async throws {
        let runner = FakeCommandRunner(results: [
            .success(.json("""
            {"schemaVersion":1,"kind":"state","data":{"runs":[],"skipped":0}}
            """))
        ])
        let client = BatonClient(runner: runner)

        do {
            _ = try await client.listRuns()
            XCTFail("Expected kind mismatch")
        } catch let error as BatonClientError {
            XCTAssertEqual(error, .unexpectedEnvelopeKind(expected: "run-list", actual: "state"))
        }
    }

    func testWatchBuildsArgvAndDecodesStreamChunks() async throws {
        let runner = FakeCommandRunner(
            results: [],
            streamChunks: [
                #"{"schemaVersion":1,"kind":"event","data":{"type":"run.created","runId":"run-a","status":"running","run":{"runId":"run-a","status":"running","dryRun":false,"workflowId":"default","createdAt":"2026-06-15T00:00:00.000Z","stepCount":1}}}"#,
                "\n"
            ]
        )
        let client = BatonClient(runner: runner)

        var events: [WatchEvent] = []
        for try await event in client.watch(intervalSeconds: 0.5, once: true) {
            events.append(event)
        }

        XCTAssertEqual(events.map(\.runId), ["run-a"])
        XCTAssertEqual(runner.streamCalls(), [["watch", "--interval", "0.5", "--once"]])
    }
}

private final class FakeCommandRunner: CommandRunner, @unchecked Sendable {
    private let lock = NSLock()
    private var results: [Result<CommandResult, Error>]
    private let streamChunksStorage: [String]
    private let streamError: Error?
    private var recordedRunCalls: [[String]]
    private var recordedStreamCalls: [[String]]

    init(results: [Result<CommandResult, Error>], streamChunks: [String] = [], streamError: Error? = nil) {
        self.results = results
        self.streamChunksStorage = streamChunks
        self.streamError = streamError
        self.recordedRunCalls = []
        self.recordedStreamCalls = []
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

    func runCalls() -> [[String]] {
        lock.lock()
        let snapshot = recordedRunCalls
        lock.unlock()
        return snapshot
    }

    func streamCalls() -> [[String]] {
        lock.lock()
        let snapshot = recordedStreamCalls
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
