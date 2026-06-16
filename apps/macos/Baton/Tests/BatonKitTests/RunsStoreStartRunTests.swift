import XCTest
@testable import BatonKit

final class RunsStoreStartRunTests: XCTestCase {
    @MainActor
    func testStartRunCallsClientThenRefreshesSnapshot() async throws {
        let options = StartRunOptions(
            dryRun: true,
            workflowId: "default",
            projectId: "project-a",
            useCodex: true,
            useClaude: false,
            useTest: true,
            testCommand: "pnpm test",
            fixEnabled: true,
            maxFixAttempts: 2
        )
        let client = RunsStoreFakeClient(
            runList: RunList(
                runs: [
                    runSummary(runId: "run-new", status: .running, createdAt: "2026-06-16T00:00:00.000Z")
                ],
                skipped: 0
            ),
            state: StateSnapshot(total: 1, byStatus: ["running": 1], recent: []),
            detail: runDetail(runId: "run-new")
        )
        let store = RunsStore(client: client)

        try await store.startRun(request: "새 기능 구현", options: options)

        XCTAssertEqual(client.calls(), [
            .startRun(request: "새 기능 구현", options: options),
            .listRuns,
            .state,
            .runDetail(id: "run-new")
        ])
        XCTAssertEqual(store.runs.map(\.runId), ["run-new"])
        XCTAssertEqual(store.selectedRunId, "run-new")
        XCTAssertEqual(store.selectedDetail?.run.id, "run-new")
        XCTAssertNil(store.errorMessage)
    }

    @MainActor
    func testStartRunFailureIsStoredAndRethrownWithoutRefresh() async throws {
        let expectedError = BatonClientError.commandFailed(arguments: ["run", "bad"], exitCode: 2, stderr: "no")
        let client = RunsStoreFakeClient(
            startRunResult: .failure(expectedError),
            runList: RunList(runs: [], skipped: 0),
            state: StateSnapshot(total: 0, byStatus: [:], recent: []),
            detail: runDetail(runId: "unused")
        )
        let store = RunsStore(client: client)

        do {
            try await store.startRun(request: "bad")
            XCTFail("Expected startRun to throw")
        } catch let error as BatonClientError {
            XCTAssertEqual(error, expectedError)
        }

        XCTAssertEqual(client.calls(), [.startRun(request: "bad", options: StartRunOptions())])
        XCTAssertEqual(store.errorMessage, expectedError.localizedDescription)
        XCTAssertFalse(store.isLoading)
    }

    private func runSummary(
        runId: String,
        status: RunStatus = .running,
        createdAt: String = "2026-06-15T00:00:00.000Z"
    ) -> RunSummary {
        RunSummary(
            runId: runId,
            status: status,
            dryRun: false,
            workflowId: "default",
            createdAt: createdAt,
            stepCount: 1
        )
    }

    private func runDetail(runId: String) -> RunDetail {
        RunDetail(
            run: RunRecord(
                id: runId,
                request: "새 기능 구현",
                workflowId: "default",
                status: .running,
                dryRun: false,
                createdAt: "2026-06-16T00:00:00.000Z",
                steps: []
            ),
            artifacts: []
        )
    }
}

private enum RunsStoreFakeCall: Equatable {
    case startRun(request: String, options: StartRunOptions)
    case listRuns
    case state
    case runDetail(id: String)
}

private final class RunsStoreFakeClient: BatonClientProtocol, @unchecked Sendable {
    private let lock = NSLock()
    private var recordedCalls: [RunsStoreFakeCall] = []
    private let startRunResult: Result<CommandResult, Error>
    private let runList: RunList
    private let snapshot: StateSnapshot
    private let detail: RunDetail

    init(
        startRunResult: Result<CommandResult, Error> = .success(CommandResult(stdout: "", stderr: "", exitCode: 0, durationMs: 1)),
        runList: RunList,
        state: StateSnapshot,
        detail: RunDetail
    ) {
        self.startRunResult = startRunResult
        self.runList = runList
        self.snapshot = state
        self.detail = detail
    }

    func listRuns() async throws -> RunList {
        record(.listRuns)
        return runList
    }

    func runDetail(id: String) async throws -> RunDetail {
        record(.runDetail(id: id))
        return detail
    }

    func state() async throws -> StateSnapshot {
        record(.state)
        return snapshot
    }

    func startRun(request: String, options: StartRunOptions) async throws -> CommandResult {
        record(.startRun(request: request, options: options))
        return try startRunResult.get()
    }

    func approve(runId: String, reject: Bool, note: String?, options: ResumeRunOptions) async throws -> CommandResult {
        CommandResult(stdout: "", stderr: "", exitCode: 0, durationMs: 1)
    }

    func resume(runId: String, options: ResumeRunOptions) async throws -> CommandResult {
        CommandResult(stdout: "", stderr: "", exitCode: 0, durationMs: 1)
    }

    func clean(runId: String) async throws -> CommandResult {
        CommandResult(stdout: "", stderr: "", exitCode: 0, durationMs: 1)
    }

    func watch(intervalSeconds: TimeInterval?, once: Bool) -> AsyncThrowingStream<WatchEvent, Error> {
        AsyncThrowingStream { continuation in
            continuation.finish()
        }
    }

    func calls() -> [RunsStoreFakeCall] {
        lock.lock()
        let snapshot = recordedCalls
        lock.unlock()
        return snapshot
    }

    private func record(_ call: RunsStoreFakeCall) {
        lock.lock()
        recordedCalls.append(call)
        lock.unlock()
    }
}
