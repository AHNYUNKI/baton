import XCTest
@testable import BatonKit

final class ProjectWorkingDirectoryTests: XCTestCase {
    func testLocalSourceReturnsFileURL() {
        let project = makeProject(kind: .local, value: "/tmp/baton local")

        XCTAssertEqual(localWorkingDirectory(for: project), URL(fileURLWithPath: "/tmp/baton local"))
    }

    func testGithubSourceReturnsNil() {
        let project = makeProject(kind: .github, value: "https://github.com/example/baton")

        XCTAssertNil(localWorkingDirectory(for: project))
    }

    func testBlankLocalSourceReturnsNil() {
        XCTAssertNil(localWorkingDirectory(for: makeProject(kind: .local, value: "")))
        XCTAssertNil(localWorkingDirectory(for: makeProject(kind: .local, value: "  \n\t  ")))
    }

    private func makeProject(kind: ProjectSourceKind, value: String) -> Project {
        Project(
            id: "project-1",
            name: "Project",
            source: ProjectSource(kind: kind, value: value),
            agentIds: ["codex"],
            createdAt: "2026-06-18T00:00:00.000Z"
        )
    }
}
