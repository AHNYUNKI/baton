import XCTest
@testable import BatonKit

final class InboxFilterTests: XCTestCase {
    func testInboxRunsReturnsOnlyAwaitingApprovalRuns() {
        let runs = [
            runSummary(runId: "run-a", status: .running),
            runSummary(runId: "run-b", status: .awaitingApproval),
            runSummary(runId: "run-c", status: .completed),
            runSummary(runId: "run-d", status: .awaitingApproval)
        ]

        let filtered = inboxRuns(runs)

        XCTAssertEqual(filtered.map(\.runId), ["run-b", "run-d"])
        XCTAssertTrue(filtered.allSatisfy { $0.status == .awaitingApproval })
    }

    func testInboxRunsReturnsEmptyArrayWhenNoRunAwaitsApproval() {
        let runs = [
            runSummary(runId: "run-a", status: .planned),
            runSummary(runId: "run-b", status: .completed)
        ]

        XCTAssertTrue(InboxFilter.inboxRuns(runs).isEmpty)
    }

    private func runSummary(runId: String, status: RunStatus) -> RunSummary {
        RunSummary(
            runId: runId,
            status: status,
            dryRun: false,
            workflowId: "default",
            createdAt: "2026-06-17T00:00:00.000Z",
            stepCount: 1
        )
    }
}
