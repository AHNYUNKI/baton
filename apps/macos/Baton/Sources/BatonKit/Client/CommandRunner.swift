import Foundation

public struct CommandResult: Equatable, Sendable {
    public let stdout: String
    public let stderr: String
    public let exitCode: Int32
    public let durationMs: Int

    public init(stdout: String, stderr: String, exitCode: Int32, durationMs: Int) {
        self.stdout = stdout
        self.stderr = stderr
        self.exitCode = exitCode
        self.durationMs = durationMs
    }
}

public protocol CommandRunner: Sendable {
    func run(arguments: [String]) async throws -> CommandResult
    func stream(arguments: [String]) -> AsyncThrowingStream<String, Error>
}

public enum CommandRunnerError: Error, Equatable, LocalizedError, Sendable {
    case executableNotFound(String)
    case timedOut(arguments: [String], timeoutSeconds: TimeInterval)
    case nonZeroExit(arguments: [String], exitCode: Int32, stderr: String)

    public var errorDescription: String? {
        switch self {
        case let .executableNotFound(executable):
            "Baton executable not found: \(executable)"
        case let .timedOut(arguments, timeoutSeconds):
            "Command timed out after \(timeoutSeconds)s: \(arguments.joined(separator: " "))"
        case let .nonZeroExit(arguments, exitCode, stderr):
            "Command failed with exit code \(exitCode): \(arguments.joined(separator: " "))\(stderr.isEmpty ? "" : "\n\(stderr)")"
        }
    }
}

public final class ProcessRunner: CommandRunner, @unchecked Sendable {
    private let executable: String
    private let workingDirectory: URL?
    private let environment: [String: String]?
    private let timeoutSeconds: TimeInterval?

    public init(
        executable: String = "baton",
        workingDirectory: URL? = nil,
        environment: [String: String]? = nil,
        timeoutSeconds: TimeInterval? = nil
    ) {
        self.executable = executable
        self.workingDirectory = workingDirectory
        self.environment = environment
        self.timeoutSeconds = timeoutSeconds
    }

    public func run(arguments: [String]) async throws -> CommandResult {
        let executable = executable
        let workingDirectory = workingDirectory
        let environment = environment
        let timeoutSeconds = timeoutSeconds

        return try await Task.detached(priority: .utility) {
            let resolvedExecutable = try Self.resolveExecutable(
                executable,
                workingDirectory: workingDirectory,
                environment: environment
            )
            let process = Process()
            process.executableURL = resolvedExecutable
            process.arguments = arguments
            process.currentDirectoryURL = workingDirectory
            if let environment {
                process.environment = environment
            }

            let processBox = LockedProcess()
            processBox.process = process

            let stdout = Pipe()
            let stderr = Pipe()
            process.standardOutput = stdout
            process.standardError = stderr

            let stdoutBuffer = LockedData()
            let stderrBuffer = LockedData()
            stdout.fileHandleForReading.readabilityHandler = { handle in
                stdoutBuffer.append(handle.availableData)
            }
            stderr.fileHandleForReading.readabilityHandler = { handle in
                stderrBuffer.append(handle.availableData)
            }

            let timedOut = LockedFlag()
            let startedAt = Date()
            try process.run()
            if let timeoutSeconds {
                let timeoutMilliseconds = max(1, Int(timeoutSeconds * 1000))
                DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + .milliseconds(timeoutMilliseconds)) {
                    if processBox.process?.isRunning == true {
                        timedOut.setTrue()
                        processBox.terminate()
                    }
                }
            }
            process.waitUntilExit()
            processBox.process = nil

            stdout.fileHandleForReading.readabilityHandler = nil
            stderr.fileHandleForReading.readabilityHandler = nil

            let durationMs = Int(Date().timeIntervalSince(startedAt) * 1000)
            let stdoutText = stdoutBuffer.utf8String()
            let stderrText = stderrBuffer.utf8String()

            if timedOut.value {
                throw CommandRunnerError.timedOut(arguments: arguments, timeoutSeconds: timeoutSeconds ?? 0)
            }

            return CommandResult(
                stdout: stdoutText,
                stderr: stderrText,
                exitCode: process.terminationStatus,
                durationMs: durationMs
            )
        }.value
    }

    public func stream(arguments: [String]) -> AsyncThrowingStream<String, Error> {
        let executable = executable
        let workingDirectory = workingDirectory
        let environment = environment
        let processBox = LockedProcess()

        return AsyncThrowingStream { continuation in
            let task = Task.detached(priority: .utility) {
                do {
                    let resolvedExecutable = try Self.resolveExecutable(
                        executable,
                        workingDirectory: workingDirectory,
                        environment: environment
                    )
                    let process = Process()
                    process.executableURL = resolvedExecutable
                    process.arguments = arguments
                    process.currentDirectoryURL = workingDirectory
                    if let environment {
                        process.environment = environment
                    }

                    let stdout = Pipe()
                    let stderr = Pipe()
                    let stderrBuffer = LockedData()
                    process.standardOutput = stdout
                    process.standardError = stderr
                    processBox.process = process

                    stdout.fileHandleForReading.readabilityHandler = { handle in
                        let data = handle.availableData
                        guard !data.isEmpty, let chunk = String(data: data, encoding: .utf8) else {
                            return
                        }
                        continuation.yield(chunk)
                    }
                    stderr.fileHandleForReading.readabilityHandler = { handle in
                        stderrBuffer.append(handle.availableData)
                    }

                    try process.run()
                    process.waitUntilExit()

                    stdout.fileHandleForReading.readabilityHandler = nil
                    stderr.fileHandleForReading.readabilityHandler = nil
                    processBox.process = nil

                    if Task.isCancelled {
                        continuation.finish()
                        return
                    }

                    if process.terminationStatus == 0 {
                        continuation.finish()
                    } else {
                        continuation.finish(
                            throwing: CommandRunnerError.nonZeroExit(
                                arguments: arguments,
                                exitCode: process.terminationStatus,
                                stderr: stderrBuffer.utf8String()
                            )
                        )
                    }
                } catch {
                    processBox.process = nil
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { @Sendable _ in
                task.cancel()
                processBox.terminate()
            }
        }
    }

    private static func resolveExecutable(
        _ executable: String,
        workingDirectory: URL?,
        environment: [String: String]?
    ) throws -> URL {
        guard !executable.isEmpty else {
            throw CommandRunnerError.executableNotFound(executable)
        }

        let fileManager = FileManager.default
        if executable.contains("/") {
            let url = URL(fileURLWithPath: executable, relativeTo: workingDirectory).standardizedFileURL
            guard fileManager.isExecutableFile(atPath: url.path) else {
                throw CommandRunnerError.executableNotFound(executable)
            }
            return url
        }

        let pathValue = environment?["PATH"]
            ?? ProcessInfo.processInfo.environment["PATH"]
            ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
        for directory in pathValue.split(separator: ":").map(String.init) {
            let path = URL(fileURLWithPath: directory).appendingPathComponent(executable).path
            if fileManager.isExecutableFile(atPath: path) {
                return URL(fileURLWithPath: path)
            }
        }

        throw CommandRunnerError.executableNotFound(executable)
    }
}

private final class LockedData: @unchecked Sendable {
    private let lock = NSLock()
    private var data = Data()

    func append(_ chunk: Data) {
        guard !chunk.isEmpty else {
            return
        }
        lock.lock()
        data.append(chunk)
        lock.unlock()
    }

    func utf8String() -> String {
        lock.lock()
        let snapshot = data
        lock.unlock()
        return String(data: snapshot, encoding: .utf8) ?? ""
    }
}

private final class LockedFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var storage = false

    var value: Bool {
        lock.lock()
        let snapshot = storage
        lock.unlock()
        return snapshot
    }

    func setTrue() {
        lock.lock()
        storage = true
        lock.unlock()
    }
}

private final class LockedProcess: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: Process?

    var process: Process? {
        get {
            lock.lock()
            let snapshot = storage
            lock.unlock()
            return snapshot
        }
        set {
            lock.lock()
            storage = newValue
            lock.unlock()
        }
    }

    func terminate() {
        lock.lock()
        let process = storage
        lock.unlock()
        if process?.isRunning == true {
            process?.terminate()
        }
    }
}
