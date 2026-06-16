import XCTest
@testable import BatonKit

final class RunsStoreTests: XCTestCase {
    func testReducerAddsCreatedRunAndSortsDeterministically() {
        let runs = [
            runSummary(runId: "run-b", createdAt: "2026-06-15T00:00:00.000Z"),
            runSummary(runId: "run-c", createdAt: "2026-06-16T00:00:00.000Z")
        ]
        let event = WatchEvent(
            type: .created,
            runId: "run-a",
            status: .running,
            run: runSummary(runId: "run-a", createdAt: "2026-06-16T00:00:00.000Z")
        )

        let reduced = RunsReducer.reduce(runs: runs, event: event)

        XCTAssertEqual(reduced.map(\.runId), ["run-a", "run-c", "run-b"])
    }

    func testReducerRemovesRun() {
        let reduced = RunsReducer.reduce(
            runs: [runSummary(runId: "run-a"), runSummary(runId: "run-b")],
            event: WatchEvent(type: .removed, runId: "run-a", status: .completed)
        )

        XCTAssertEqual(reduced.map(\.runId), ["run-b"])
    }

    func testReducerUpdatesStatusChangedRun() {
        let reduced = RunsReducer.reduce(
            runs: [runSummary(runId: "run-a", status: .running)],
            event: WatchEvent(
                type: .statusChanged,
                runId: "run-a",
                previousStatus: .running,
                status: .completed,
                run: runSummary(runId: "run-a", status: .completed, outcome: .completed)
            )
        )

        XCTAssertEqual(reduced.first?.status, .completed)
        XCTAssertEqual(reduced.first?.outcome, .completed)
    }

    func testReducerUpdatesRunWithoutChangingStatus() {
        let reduced = RunsReducer.reduce(
            runs: [runSummary(runId: "run-a", status: .running, updatedAt: "2026-06-15T00:00:00.000Z")],
            event: WatchEvent(
                type: .updated,
                runId: "run-a",
                status: .running,
                previousUpdatedAt: "2026-06-15T00:00:00.000Z",
                updatedAt: "2026-06-15T00:01:00.000Z"
            )
        )

        XCTAssertEqual(reduced.first?.status, .running)
        XCTAssertEqual(reduced.first?.updatedAt, "2026-06-15T00:01:00.000Z")
    }

    func testReducerIgnoresIncompleteCreatedEvent() {
        let runs = [runSummary(runId: "run-a")]

        let reduced = RunsReducer.reduce(
            runs: runs,
            event: WatchEvent(type: .created, runId: "run-b", status: .running)
        )

        XCTAssertEqual(reduced, runs)
    }

    @MainActor
    func testStoreLoadsSnapshotAndState() async throws {
        let runner = StoreFakeRunner(results: [
            .success(.json("""
            {"schemaVersion":1,"kind":"run-list","data":{"runs":[{"runId":"run-old","status":"running","dryRun":false,"workflowId":"default","createdAt":"2026-06-15T00:00:00.000Z","stepCount":1},{"runId":"run-new","status":"completed","dryRun":false,"workflowId":"default","createdAt":"2026-06-16T00:00:00.000Z","stepCount":1,"outcome":"completed"}],"skipped":0}}
            """)),
            .success(.json("""
            {"schemaVersion":1,"kind":"state","data":{"total":2,"byStatus":{"planned":0,"running":1,"awaiting-approval":0,"completed":1,"failed":0,"cancelled":0},"recent":[]}}
            """)),
            .success(.json("""
            {"schemaVersion":1,"kind":"run-detail","data":{"run":{"id":"run-new","request":"Build","workflowId":"default","status":"completed","dryRun":false,"createdAt":"2026-06-16T00:00:00.000Z","steps":[]},"artifacts":["run.json"]}}
            """))
        ])
        let store = RunsStore(client: BatonClient(runner: runner))

        await store.load()

        XCTAssertEqual(store.runs.map(\.runId), ["run-new", "run-old"])
        XCTAssertEqual(store.selectedRunId, "run-new")
        XCTAssertEqual(store.selectedDetail?.run.id, "run-new")
        XCTAssertEqual(store.state?.total, 2)
    }

    private func runSummary(
        runId: String,
        status: RunStatus = .running,
        createdAt: String = "2026-06-15T00:00:00.000Z",
        updatedAt: String? = nil,
        outcome: RunStatus? = nil
    ) -> RunSummary {
        RunSummary(
            runId: runId,
            status: status,
            dryRun: false,
            workflowId: "default",
            createdAt: createdAt,
            updatedAt: updatedAt,
            stepCount: 1,
            outcome: outcome
        )
    }
}

private final class StoreFakeRunner: CommandRunner, @unchecked Sendable {
    private let lock = NSLock()
    private var results: [Result<CommandResult, Error>]

    init(results: [Result<CommandResult, Error>]) {
        self.results = results
    }

    func run(arguments: [String]) async throws -> CommandResult {
        try dequeueRunResult().get()
    }

    private func dequeueRunResult() -> Result<CommandResult, Error> {
        lock.lock()
        let result = results.removeFirst()
        lock.unlock()
        return result
    }

    func stream(arguments: [String]) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            continuation.finish()
        }
    }
}

private extension CommandResult {
    static func json(_ stdout: String) -> CommandResult {
        CommandResult(stdout: stdout, stderr: "", exitCode: 0, durationMs: 1)
    }
}
