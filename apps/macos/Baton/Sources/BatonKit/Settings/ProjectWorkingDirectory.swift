import Foundation

public func localWorkingDirectory(for project: Project) -> URL? {
    guard project.source.kind == .local else {
        return nil
    }

    guard !project.source.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        return nil
    }

    return URL(fileURLWithPath: project.source.value)
}
