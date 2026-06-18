import Foundation

public enum BatonClientError: Error, Equatable, LocalizedError, Sendable {
    case batonNotFound(String)
    case commandFailed(arguments: [String], exitCode: Int32, stderr: String)
    case emptyOutput(arguments: [String])
    case unexpectedEnvelopeKind(expected: String, actual: String)
    case invalidProjectForm
    case invalidTeamPlan

    public var errorDescription: String? {
        switch self {
        case let .batonNotFound(executable):
            "Baton CLI was not found: \(executable)"
        case let .commandFailed(arguments, exitCode, stderr):
            "Baton command failed with exit code \(exitCode): \(arguments.joined(separator: " "))\(stderr.isEmpty ? "" : "\n\(stderr)")"
        case let .emptyOutput(arguments):
            "Baton command produced no JSON output: \(arguments.joined(separator: " "))"
        case let .unexpectedEnvelopeKind(expected, actual):
            "Unexpected Baton envelope kind \(actual); expected \(expected)."
        case .invalidProjectForm:
            "Project form is incomplete or invalid."
        case .invalidTeamPlan:
            "TeamPlan is incomplete or invalid."
        }
    }
}

public struct StartRunOptions: Equatable, Sendable {
    public var dryRun: Bool
    public var workflowId: String?
    public var projectId: String?
    public var useCodex: Bool?
    public var useClaude: Bool?
    public var useTest: Bool?
    public var testCommand: String?
    public var fixEnabled: Bool?
    public var maxFixAttempts: Int?

    public init(
        dryRun: Bool = false,
        workflowId: String? = nil,
        projectId: String? = nil,
        useCodex: Bool? = nil,
        useClaude: Bool? = nil,
        useTest: Bool? = nil,
        testCommand: String? = nil,
        fixEnabled: Bool? = nil,
        maxFixAttempts: Int? = nil
    ) {
        self.dryRun = dryRun
        self.workflowId = workflowId
        self.projectId = projectId
        self.useCodex = useCodex
        self.useClaude = useClaude
        self.useTest = useTest
        self.testCommand = testCommand
        self.fixEnabled = fixEnabled
        self.maxFixAttempts = maxFixAttempts
    }
}

public struct ResumeRunOptions: Equatable, Sendable {
    public var useCodex: Bool?
    public var useClaude: Bool?
    public var useTest: Bool?
    public var testCommand: String?
    public var fixEnabled: Bool?
    public var maxFixAttempts: Int?

    public init(
        useCodex: Bool? = nil,
        useClaude: Bool? = nil,
        useTest: Bool? = nil,
        testCommand: String? = nil,
        fixEnabled: Bool? = nil,
        maxFixAttempts: Int? = nil
    ) {
        self.useCodex = useCodex
        self.useClaude = useClaude
        self.useTest = useTest
        self.testCommand = testCommand
        self.fixEnabled = fixEnabled
        self.maxFixAttempts = maxFixAttempts
    }
}

public struct StartTeamRunOptions: Equatable, Sendable {
    public var codex: Bool
    public var claude: Bool
    public var write: Bool
    public var baseBranch: String?
    public var timeoutMs: Int?

    public init(
        codex: Bool = false,
        claude: Bool = false,
        write: Bool = false,
        baseBranch: String? = nil,
        timeoutMs: Int? = nil
    ) {
        self.codex = codex
        self.claude = claude
        self.write = write
        self.baseBranch = baseBranch
        self.timeoutMs = timeoutMs
    }
}

public protocol BatonClientProtocol: Sendable {
    func listRuns() async throws -> RunList
    func runDetail(id: String) async throws -> RunDetail
    func state() async throws -> StateSnapshot
    @discardableResult
    func startRun(request: String, options: StartRunOptions) async throws -> CommandResult
    @discardableResult
    func approve(runId: String, reject: Bool, note: String?, options: ResumeRunOptions) async throws -> CommandResult
    @discardableResult
    func resume(runId: String, options: ResumeRunOptions) async throws -> CommandResult
    @discardableResult
    func clean(runId: String) async throws -> CommandResult
    func watch(intervalSeconds: TimeInterval?, once: Bool) -> AsyncThrowingStream<WatchEvent, Error>
}

public struct BatonClient: Sendable {
    private let runner: any CommandRunner

    public init(
        executable: String = "baton",
        workingDirectory: URL? = nil,
        timeoutSeconds: TimeInterval? = nil
    ) {
        self.runner = ProcessRunner(
            executable: executable,
            workingDirectory: workingDirectory,
            timeoutSeconds: timeoutSeconds
        )
    }

    public init(runner: any CommandRunner) {
        self.runner = runner
    }

    public func listRuns() async throws -> RunList {
        try await decodeJSON(arguments: ["run", "list", "--json"], expectedKind: "run-list")
    }

    public func runDetail(id: String) async throws -> RunDetail {
        try await decodeJSON(arguments: ["run", "show", id, "--json"], expectedKind: "run-detail")
    }

    public func state() async throws -> StateSnapshot {
        try await decodeJSON(arguments: ["state", "--json"], expectedKind: "state")
    }

    public func listProjects() async throws -> [Project] {
        try await decodeJSON(arguments: ["project", "list", "--json"], expectedKind: "project-list")
    }

    public func generateTeamPlan(projectId: String, overview: String) async throws -> TeamPlan {
        let trimmed = overview.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !projectId.isEmpty, !trimmed.isEmpty else {
            throw BatonClientError.invalidTeamPlan
        }
        return try await decodeJSON(arguments: ["project", "plan", "generate", projectId, "--overview", trimmed], expectedKind: "team-plan")
    }

    public func showTeamPlan(projectId: String) async throws -> TeamPlan {
        try await decodeJSON(arguments: ["project", "plan", "show", projectId, "--json"], expectedKind: "team-plan")
    }

    public func listTeamRuns(projectId: String) async throws -> TeamRunList {
        try await decodeJSON(arguments: ["project", "plan", "run", "list", projectId, "--json"], expectedKind: "team-run-list")
    }

    public func showTeamRun(teamRunId: String) async throws -> TeamRun {
        try await decodeJSON(arguments: ["project", "plan", "run", "show", teamRunId, "--json"], expectedKind: "team-run")
    }

    @discardableResult
    public func startTeamRun(projectId: String, options: StartTeamRunOptions = StartTeamRunOptions()) async throws -> TeamRun {
        var arguments = ["project", "plan", "run", "start", projectId]
        appendStartTeamRunOptions(options, to: &arguments)
        arguments.append("--json")
        return try await decodeJSON(arguments: arguments, expectedKind: "team-run")
    }

    @discardableResult
    public func approveTeamRun(teamRunId: String, reject: Bool = false, note: String? = nil) async throws -> TeamRun {
        var arguments = ["project", "plan", "run", reject ? "reject" : "approve", teamRunId]
        if let note, !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            arguments.append(contentsOf: ["--note", note])
        }
        arguments.append("--json")
        return try await decodeJSON(arguments: arguments, expectedKind: "team-run")
    }

    @discardableResult
    public func reviewTeamRun(teamRunId: String, accept: Bool, note: String? = nil) async throws -> TeamRun {
        var arguments = ["project", "plan", "run", "review", teamRunId, accept ? "--accept" : "--reject"]
        if let note, !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            arguments.append(contentsOf: ["--note", note])
        }
        arguments.append("--json")
        return try await decodeJSON(arguments: arguments, expectedKind: "team-run")
    }

    @discardableResult
    public func setTeamPlan(projectId: String, plan: TeamPlan) async throws -> TeamPlan {
        guard !projectId.isEmpty, !plan.roles.isEmpty else {
            throw BatonClientError.invalidTeamPlan
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("baton-team-plan-\(UUID().uuidString)")
            .appendingPathExtension("json")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(plan).write(to: url, options: .atomic)
        defer {
            try? FileManager.default.removeItem(at: url)
        }

        return try await decodeJSON(arguments: ["project", "plan", "set", projectId, "--file", url.path], expectedKind: "team-plan")
    }

    @discardableResult
    public func createProject(_ form: ProjectFormModel) async throws -> CommandResult {
        guard form.canSubmit else {
            throw BatonClientError.invalidProjectForm
        }
        return try await runMutation(arguments: form.buildCreateArguments())
    }

    @discardableResult
    public func startRun(request: String, options: StartRunOptions = StartRunOptions()) async throws -> CommandResult {
        var arguments = ["run", request]
        if options.dryRun {
            arguments.append("--dry-run")
        }
        appendWorkerOptions(options, to: &arguments)
        if let workflowId = options.workflowId {
            arguments.append(contentsOf: ["--workflow", workflowId])
        }
        if let projectId = options.projectId {
            arguments.append(contentsOf: ["--project", projectId])
        }
        return try await runMutation(arguments: arguments)
    }

    @discardableResult
    public func approve(runId: String, reject: Bool = false, note: String? = nil, options: ResumeRunOptions = ResumeRunOptions()) async throws -> CommandResult {
        var arguments = ["run", "approve", runId]
        appendWorkerOptions(options, to: &arguments)
        if reject {
            arguments.append("--reject")
        }
        if let note, !note.isEmpty {
            arguments.append(contentsOf: ["--note", note])
        }
        return try await runMutation(arguments: arguments)
    }

    @discardableResult
    public func resume(runId: String, options: ResumeRunOptions = ResumeRunOptions()) async throws -> CommandResult {
        var arguments = ["run", "resume", runId]
        appendWorkerOptions(options, to: &arguments)
        return try await runMutation(arguments: arguments)
    }

    @discardableResult
    public func clean(runId: String) async throws -> CommandResult {
        try await runMutation(arguments: ["run", "clean", runId])
    }

    public func watch(intervalSeconds: TimeInterval? = nil, once: Bool = false) -> AsyncThrowingStream<WatchEvent, Error> {
        var arguments = ["watch"]
        if let intervalSeconds {
            arguments.append(contentsOf: ["--interval", formatInterval(intervalSeconds)])
        }
        if once {
            arguments.append("--once")
        }
        let streamArguments = arguments

        return AsyncThrowingStream { continuation in
            let task = Task { [runner, streamArguments] in
                var parser = NDJSONParser()
                do {
                    for try await chunk in runner.stream(arguments: streamArguments) {
                        for event in try parser.append(chunk) {
                            continuation.yield(event)
                        }
                    }
                    for event in try parser.finish() {
                        continuation.yield(event)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: mapRunnerError(error))
                }
            }

            continuation.onTermination = { @Sendable _ in
                task.cancel()
            }
        }
    }

    private func decodeJSON<Payload: Codable & Equatable & Sendable>(
        arguments: [String],
        expectedKind: String
    ) async throws -> Payload {
        let result = try await execute(arguments: arguments)
        guard result.exitCode == 0 else {
            throw BatonClientError.commandFailed(arguments: arguments, exitCode: result.exitCode, stderr: result.stderr)
        }

        let trimmed = result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw BatonClientError.emptyOutput(arguments: arguments)
        }

        let envelope = try JSONDecoder().decode(JsonEnvelope<Payload>.self, from: Data(trimmed.utf8))
        guard envelope.kind == expectedKind else {
            throw BatonClientError.unexpectedEnvelopeKind(expected: expectedKind, actual: envelope.kind)
        }
        return envelope.data
    }

    private func runMutation(arguments: [String]) async throws -> CommandResult {
        let result = try await execute(arguments: arguments)
        guard result.exitCode == 0 else {
            throw BatonClientError.commandFailed(arguments: arguments, exitCode: result.exitCode, stderr: result.stderr)
        }
        return result
    }

    private func execute(arguments: [String]) async throws -> CommandResult {
        do {
            return try await runner.run(arguments: arguments)
        } catch {
            throw mapRunnerError(error)
        }
    }

    private func appendWorkerOptions(_ options: StartRunOptions, to arguments: inout [String]) {
        appendBooleanOption(options.useCodex, positive: "--codex", negative: "--no-codex", to: &arguments)
        appendBooleanOption(options.useClaude, positive: "--claude", negative: "--no-claude", to: &arguments)
        appendBooleanOption(options.useTest, positive: "--test", negative: "--no-test", to: &arguments)
        if let testCommand = options.testCommand {
            arguments.append(contentsOf: ["--test-command", testCommand])
        }
        appendBooleanOption(options.fixEnabled, positive: "--fix", negative: "--no-fix", to: &arguments)
        if let maxFixAttempts = options.maxFixAttempts {
            arguments.append(contentsOf: ["--max-fix-attempts", String(maxFixAttempts)])
        }
    }

    private func appendWorkerOptions(_ options: ResumeRunOptions, to arguments: inout [String]) {
        appendBooleanOption(options.useCodex, positive: "--codex", negative: "--no-codex", to: &arguments)
        appendBooleanOption(options.useClaude, positive: "--claude", negative: "--no-claude", to: &arguments)
        appendBooleanOption(options.useTest, positive: "--test", negative: "--no-test", to: &arguments)
        if let testCommand = options.testCommand {
            arguments.append(contentsOf: ["--test-command", testCommand])
        }
        appendBooleanOption(options.fixEnabled, positive: "--fix", negative: "--no-fix", to: &arguments)
        if let maxFixAttempts = options.maxFixAttempts {
            arguments.append(contentsOf: ["--max-fix-attempts", String(maxFixAttempts)])
        }
    }

    private func appendStartTeamRunOptions(_ options: StartTeamRunOptions, to arguments: inout [String]) {
        if options.codex {
            arguments.append("--codex")
        }
        if options.claude {
            arguments.append("--claude")
        }
        if options.write {
            arguments.append("--write")
        }
        if let baseBranch = options.baseBranch?.trimmingCharacters(in: .whitespacesAndNewlines), !baseBranch.isEmpty {
            arguments.append(contentsOf: ["--base", baseBranch])
        }
        if let timeoutMs = options.timeoutMs {
            arguments.append(contentsOf: ["--timeout-ms", String(timeoutMs)])
        }
    }

    private func appendBooleanOption(_ value: Bool?, positive: String, negative: String, to arguments: inout [String]) {
        guard let value else {
            return
        }
        arguments.append(value ? positive : negative)
    }

    private func formatInterval(_ interval: TimeInterval) -> String {
        let rounded = interval.rounded()
        if abs(interval - rounded) < .ulpOfOne {
            return String(Int(rounded))
        }
        return String(interval)
    }
}

extension BatonClient: BatonClientProtocol {}

private func mapRunnerError(_ error: Error) -> Error {
    if case let CommandRunnerError.executableNotFound(executable) = error {
        return BatonClientError.batonNotFound(executable)
    }
    if case let CommandRunnerError.nonZeroExit(arguments, exitCode, stderr) = error {
        return BatonClientError.commandFailed(arguments: arguments, exitCode: exitCode, stderr: stderr)
    }
    return error
}
