import Foundation

public struct AppNavigationModel: Equatable, Sendable {
    public enum Section: Equatable, Hashable, Sendable {
        case dashboard
        case inbox
        case runs
        case project(id: String)
        case agents
        case settings
    }

    public enum ProjectTab: String, CaseIterable, Equatable, Hashable, Sendable {
        case overview
        case plan
        case org
        case run
    }

    public private(set) var section: Section
    public private(set) var projectTab: ProjectTab
    public private(set) var selectedProjectId: String?

    public init(
        section: Section = .dashboard,
        projectTab: ProjectTab = .overview,
        selectedProjectId: String? = nil
    ) {
        self.section = section
        self.projectTab = projectTab
        self.selectedProjectId = Self.normalizedProjectId(selectedProjectId)

        if case let .project(id) = section {
            let normalized = Self.normalizedProjectId(id)
            self.section = normalized.map { .project(id: $0) } ?? .dashboard
            self.selectedProjectId = normalized
            if normalized != nil {
                self.projectTab = projectTab
            }
        }
    }

    @discardableResult
    public mutating func select(_ section: Section) -> Bool {
        switch section {
        case let .project(id):
            return selectProject(id: id)
        default:
            self.section = section
            return true
        }
    }

    @discardableResult
    public mutating func selectProject(id: String) -> Bool {
        guard let normalized = Self.normalizedProjectId(id) else {
            return false
        }

        section = .project(id: normalized)
        selectedProjectId = normalized
        projectTab = .overview
        return true
    }

    @discardableResult
    public mutating func selectTab(_ tab: ProjectTab) -> Bool {
        guard selectedProjectId != nil else {
            return false
        }

        projectTab = tab
        if case .project = section {
            return true
        }
        return true
    }

    @discardableResult
    public mutating func returnToSelectedProject() -> Bool {
        guard let selectedProjectId else {
            return false
        }

        section = .project(id: selectedProjectId)
        return true
    }

    private static func normalizedProjectId(_ id: String?) -> String? {
        guard let id else {
            return nil
        }
        let trimmed = id.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
