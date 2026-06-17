import Foundation

public enum InboxFilter {
    public static func inboxRuns(_ runs: [RunSummary]) -> [RunSummary] {
        runs.filter { $0.status == .awaitingApproval }
    }
}

public func inboxRuns(_ runs: [RunSummary]) -> [RunSummary] {
    InboxFilter.inboxRuns(runs)
}
