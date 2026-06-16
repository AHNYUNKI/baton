import Combine
import Foundation

public enum RunsReducer {
    public static func sorted(_ runs: [RunSummary]) -> [RunSummary] {
        runs.sorted { left, right in
            if left.createdAt != right.createdAt {
                return left.createdAt > right.createdAt
            }
            return left.runId < right.runId
        }
    }

    public static func reduce(runs: [RunSummary], event: WatchEvent) -> [RunSummary] {
        var byId = Dictionary(uniqueKeysWithValues: runs.map { ($0.runId, $0) })

        switch event.type {
        case .created:
            guard let run = event.run else {
                return sorted(Array(byId.values))
            }
            byId[event.runId] = run

        case .removed:
            byId.removeValue(forKey: event.runId)

        case .statusChanged:
            if let run = event.run {
                byId[event.runId] = run
            } else if let existing = byId[event.runId] {
                byId[event.runId] = existing.replacing(status: event.status)
            }

        case .updated:
            if let run = event.run {
                byId[event.runId] = run
            } else if let existing = byId[event.runId] {
                byId[event.runId] = existing.replacing(updatedAt: event.updatedAt)
            }
        }

        return sorted(Array(byId.values))
    }
}

@MainActor
public final class RunsStore: ObservableObject {
    @Published public private(set) var runs: [RunSummary]
    @Published public private(set) var state: StateSnapshot?
    @Published public private(set) var selectedDetail: RunDetail?
    @Published public private(set) var isLoading: Bool
    @Published public private(set) var errorMessage: String?
    @Published public var selectedRunId: String?

    private let client: any BatonClientProtocol
    private var watchTask: Task<Void, Never>?

    public init(client: any BatonClientProtocol = BatonClient()) {
        self.client = client
        self.runs = []
        self.state = nil
        self.selectedDetail = nil
        self.isLoading = false
        self.errorMessage = nil
        self.selectedRunId = nil
    }

    public func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let runList = try await client.listRuns()
            let snapshot = try await client.state()
            runs = RunsReducer.sorted(runList.runs)
            state = snapshot
            errorMessage = nil

            if selectedRunId == nil {
                selectedRunId = runs.first?.runId
            }
            if let selectedRunId {
                await loadDetail(runId: selectedRunId)
            } else {
                selectedDetail = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func startRun(request: String, options: StartRunOptions = StartRunOptions()) async throws {
        isLoading = true
        do {
            _ = try await client.startRun(request: request, options: options)
            errorMessage = nil
            selectedRunId = nil
            isLoading = false
            await load()
        } catch {
            isLoading = false
            errorMessage = error.localizedDescription
            throw error
        }
    }

    public func select(runId: String?) async {
        selectedRunId = runId
        guard let runId else {
            selectedDetail = nil
            return
        }
        await loadDetail(runId: runId)
    }

    public func loadDetail(runId: String) async {
        do {
            selectedDetail = try await client.runDetail(id: runId)
            errorMessage = nil
        } catch {
            selectedDetail = nil
            errorMessage = error.localizedDescription
        }
    }

    public func startWatching(intervalSeconds: TimeInterval? = nil) {
        stopWatching()
        watchTask = Task { [weak self, client] in
            do {
                for try await event in client.watch(intervalSeconds: intervalSeconds, once: false) {
                    guard let self else {
                        return
                    }
                    self.apply(event: event)
                }
            } catch {
                self?.errorMessage = error.localizedDescription
            }
        }
    }

    public func stopWatching() {
        watchTask?.cancel()
        watchTask = nil
    }

    public func apply(event: WatchEvent) {
        runs = RunsReducer.reduce(runs: runs, event: event)
        if selectedRunId == nil {
            selectedRunId = runs.first?.runId
        }
        if event.runId == selectedRunId {
            Task {
                await loadDetail(runId: event.runId)
            }
        }
    }

    public func approveSelected(note: String? = nil) async {
        await performSelectedMutation { runId in
            try await client.approve(runId: runId, reject: false, note: note, options: ResumeRunOptions())
        }
    }

    public func rejectSelected(note: String? = nil) async {
        await performSelectedMutation { runId in
            try await client.approve(runId: runId, reject: true, note: note, options: ResumeRunOptions())
        }
    }

    public func resumeSelected() async {
        await performSelectedMutation { runId in
            try await client.resume(runId: runId, options: ResumeRunOptions())
        }
    }

    public func cleanSelected() async {
        await performSelectedMutation { runId in
            try await client.clean(runId: runId)
        }
    }

    private func performSelectedMutation(_ action: (String) async throws -> CommandResult) async {
        guard let selectedRunId else {
            return
        }

        do {
            _ = try await action(selectedRunId)
            errorMessage = nil
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
