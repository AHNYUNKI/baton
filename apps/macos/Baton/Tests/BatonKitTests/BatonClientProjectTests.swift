import XCTest
@testable import BatonKit

final class BatonClientProjectTests: XCTestCase {
    func testListProjectsBuildsArgvAndDecodesEnvelope() async throws {
        let runner = ProjectClientFakeRunner(results: [
            .success(.json("""
            {"schemaVersion":1,"kind":"project-list","data":[{"id":"project-1","name":"Baton","source":{"kind":"github","value":"https://github.com/example/baton"},"agentIds":["codex","claude"],"leadAgentId":"claude","createdAt":"2026-06-15T00:00:00.000Z"}]}
            """))
        ])
        let client = BatonClient(runner: runner)

        let projects = try await client.listProjects()

        XCTAssertEqual(projects.map(\.id), ["project-1"])
        XCTAssertEqual(projects.first?.source.kind, .github)
        XCTAssertEqual(projects.first?.leadAgentId, "claude")
        XCTAssertEqual(runner.runCalls(), [["project", "list", "--json"]])
    }

    func testCreateProjectBuildsArgvArray() async throws {
        let runner = ProjectClientFakeRunner(results: [.success(.ok)])
        let client = BatonClient(runner: runner)
        let form = ProjectFormModel(
            name: "GitHub App",
            sourceKind: .github,
            sourceValue: "https://github.com/example/baton",
            agentIds: ["codex", "claude"],
            leadAgentId: "claude"
        )

        try await client.createProject(form)

        XCTAssertEqual(
            runner.runCalls(),
            [[
                "project",
                "create",
                "--name",
                "GitHub App",
                "--source-kind",
                "github",
                "--source",
                "https://github.com/example/baton",
                "--agent",
                "codex",
                "--agent",
                "claude",
                "--lead",
                "claude"
            ]]
        )
    }

    func testCreateProjectRejectsInvalidFormWithoutRunningCommand() async throws {
        let runner = ProjectClientFakeRunner(results: [.success(.ok)])
        let client = BatonClient(runner: runner)

        do {
            try await client.createProject(ProjectFormModel(name: "", sourceValue: "", agentIds: []))
            XCTFail("Expected invalid form")
        } catch let error as BatonClientError {
            XCTAssertEqual(error, .invalidProjectForm)
        }

        XCTAssertEqual(runner.runCalls(), [])
    }
}

private final class ProjectClientFakeRunner: CommandRunner, @unchecked Sendable {
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

    private func dequeueRunResult(arguments: [String]) -> Result<CommandResult, Error> {
        lock.lock()
        recordedRunCalls.append(arguments)
        let result = results.isEmpty ? .success(.ok) : results.removeFirst()
        lock.unlock()
        return result
    }
}

private extension CommandResult {
    static let ok = CommandResult(stdout: "", stderr: "", exitCode: 0, durationMs: 1)

    static func json(_ stdout: String) -> CommandResult {
        CommandResult(stdout: stdout, stderr: "", exitCode: 0, durationMs: 1)
    }
}
