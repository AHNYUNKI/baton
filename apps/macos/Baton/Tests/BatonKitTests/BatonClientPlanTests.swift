import Foundation
import XCTest
@testable import BatonKit

final class BatonClientPlanTests: XCTestCase {
    func testGenerateShowAndSetTeamPlanUseArrayArgumentsAndDecodeEnvelope() async throws {
        let planJson = """
        {"roles":[{"id":"planner","name":"Planner","description":"Plans work","assignedAgentId":"claude","instructions":"Draft plan."}]}
        """
        let runner = PlanClientFakeRunner(results: [
            .success(.json(#"{"schemaVersion":1,"kind":"team-plan","data":\#(planJson)}"#)),
            .success(.json(#"{"schemaVersion":1,"kind":"team-plan","data":\#(planJson)}"#)),
            .success(.json(#"{"schemaVersion":1,"kind":"team-plan","data":\#(planJson)}"#))
        ])
        let client = BatonClient(runner: runner)

        let generated = try await client.generateTeamPlan(projectId: "project-1", overview: "  Build team planning.  ")
        let shown = try await client.showTeamPlan(projectId: "project-1")
        let saved = try await client.setTeamPlan(projectId: "project-1", plan: shown)

        XCTAssertEqual(generated.roles.map(\.id), ["planner"])
        XCTAssertEqual(saved.roles.first?.assignedAgentId, "claude")
        XCTAssertEqual(runner.runCalls()[0], ["project", "plan", "generate", "project-1", "--overview", "Build team planning."])
        XCTAssertEqual(runner.runCalls()[1], ["project", "plan", "show", "project-1", "--json"])
        XCTAssertEqual(Array(runner.runCalls()[2].prefix(4)), ["project", "plan", "set", "project-1"])
        XCTAssertEqual(runner.runCalls()[2][4], "--file")
        XCTAssertTrue(runner.filePayloads().first?.contains(#""assignedAgentId":"claude""#) == true)
    }

    func testGenerateRejectsEmptyOverviewWithoutRunningCommand() async {
        let runner = PlanClientFakeRunner(results: [.success(.ok)])
        let client = BatonClient(runner: runner)

        do {
            _ = try await client.generateTeamPlan(projectId: "project-1", overview: "   ")
            XCTFail("Expected invalid TeamPlan input")
        } catch let error as BatonClientError {
            XCTAssertEqual(error, .invalidTeamPlan)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }

        XCTAssertEqual(runner.runCalls(), [])
    }
}

private final class PlanClientFakeRunner: CommandRunner, @unchecked Sendable {
    private let lock = NSLock()
    private var results: [Result<CommandResult, Error>]
    private var recordedRunCalls: [[String]]
    private var recordedFilePayloads: [String]

    init(results: [Result<CommandResult, Error>]) {
        self.results = results
        self.recordedRunCalls = []
        self.recordedFilePayloads = []
    }

    func run(arguments: [String]) async throws -> CommandResult {
        if let fileIndex = arguments.firstIndex(of: "--file"), arguments.indices.contains(fileIndex + 1) {
            let path = arguments[fileIndex + 1]
            let payload = (try? String(contentsOfFile: path, encoding: .utf8)) ?? ""
            recordFilePayload(payload)
        }
        return try dequeueRunResult(arguments: arguments).get()
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

    func filePayloads() -> [String] {
        lock.lock()
        let snapshot = recordedFilePayloads
        lock.unlock()
        return snapshot
    }

    private func dequeueRunResult(arguments: [String]) -> Result<CommandResult, Error> {
        lock.lock()
        recordedRunCalls.append(arguments)
        let result = results.isEmpty ? .success(.ok) : results.removeFirst()
        lock.unlock()
        return result
    }

    private func recordFilePayload(_ payload: String) {
        lock.lock()
        recordedFilePayloads.append(payload)
        lock.unlock()
    }
}

private extension CommandResult {
    static let ok = CommandResult(stdout: "", stderr: "", exitCode: 0, durationMs: 1)

    static func json(_ stdout: String) -> CommandResult {
        CommandResult(stdout: stdout, stderr: "", exitCode: 0, durationMs: 1)
    }
}
