import Foundation

public struct NewRunFormModel: Equatable, Sendable {
    public var request: String
    public var dryRun: Bool
    public var useCodex: Bool?
    public var useClaude: Bool?
    public var useTest: Bool?
    public var testCommand: String
    public var fixEnabled: Bool?
    public var maxFixAttemptsText: String
    public var workflowId: String?
    public var projectId: String?

    public init(
        request: String = "",
        dryRun: Bool = false,
        useCodex: Bool? = nil,
        useClaude: Bool? = nil,
        useTest: Bool? = nil,
        testCommand: String = "",
        fixEnabled: Bool? = nil,
        maxFixAttemptsText: String = "",
        workflowId: String? = nil,
        projectId: String? = nil
    ) {
        self.request = request
        self.dryRun = dryRun
        self.useCodex = useCodex
        self.useClaude = useClaude
        self.useTest = useTest
        self.testCommand = testCommand
        self.fixEnabled = fixEnabled
        self.maxFixAttemptsText = maxFixAttemptsText
        self.workflowId = workflowId
        self.projectId = projectId
    }

    public var trimmedRequest: String {
        request.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public var isValid: Bool {
        !trimmedRequest.isEmpty
    }

    public var canSubmit: Bool {
        isValid && isMaxFixAttemptsValid
    }

    public var maxFixAttempts: Int? {
        let trimmed = maxFixAttemptsText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }
        guard let value = Int(trimmed), value >= 0 else {
            return nil
        }
        return value
    }

    public var isMaxFixAttemptsValid: Bool {
        let trimmed = maxFixAttemptsText.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || maxFixAttempts != nil
    }

    public func buildOptions() -> StartRunOptions {
        StartRunOptions(
            dryRun: dryRun,
            workflowId: normalizedOptional(workflowId),
            projectId: normalizedOptional(projectId),
            useCodex: useCodex,
            useClaude: useClaude,
            useTest: useTest,
            testCommand: normalizedOptional(testCommand),
            fixEnabled: fixEnabled,
            maxFixAttempts: maxFixAttempts
        )
    }

    private func normalizedOptional(_ value: String?) -> String? {
        guard let value else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
