import XCTest
@testable import BatonKit

final class ProjectFormModelTests: XCTestCase {
    func testDefaultFormRequiresNameAndSource() {
        let form = ProjectFormModel()

        XCTAssertFalse(form.isValid)
        XCTAssertEqual(form.normalizedAgentIds, ["codex"])
        XCTAssertEqual(form.normalizedLeadAgentId, "codex")
    }

    func testBuildCreateArgumentsForSingleAgentOmitsLeadForCoreAutoSelection() {
        let form = ProjectFormModel(
            name: "  Baton App  ",
            sourceKind: .local,
            sourceValue: "  /tmp/baton app  ",
            agentIds: ["codex"],
            leadAgentId: nil
        )

        XCTAssertTrue(form.isValid)
        XCTAssertEqual(
            form.buildCreateArguments(),
            [
                "project",
                "create",
                "--name",
                "Baton App",
                "--source-kind",
                "local",
                "--source",
                "/tmp/baton app",
                "--agent",
                "codex"
            ]
        )
    }

    func testBuildCreateArgumentsForMultipleAgentsIncludesLead() {
        let form = ProjectFormModel(
            name: "GitHub App",
            sourceKind: .github,
            sourceValue: "https://github.com/example/baton",
            agentIds: ["codex", "claude"],
            leadAgentId: "claude"
        )

        XCTAssertTrue(form.isValid)
        XCTAssertEqual(
            form.buildCreateArguments(),
            [
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
            ]
        )
    }

    func testValidationRejectsIncompleteAndInvalidValues() {
        XCTAssertFalse(ProjectFormModel(name: "  ", sourceValue: "/tmp/app", agentIds: ["codex"]).isValid)
        XCTAssertFalse(ProjectFormModel(name: "App", sourceValue: "  ", agentIds: ["codex"]).isValid)
        XCTAssertFalse(ProjectFormModel(name: "App", sourceKind: .github, sourceValue: "/tmp/app", agentIds: ["codex"]).isValid)
        XCTAssertFalse(ProjectFormModel(name: "App", sourceValue: "/tmp/app", agentIds: []).isValid)
        XCTAssertFalse(ProjectFormModel(name: "App", sourceValue: "/tmp/app", agentIds: ["cursor"]).isValid)
        XCTAssertFalse(ProjectFormModel(name: "App", sourceValue: "/tmp/app", agentIds: ["codex", "claude"], leadAgentId: nil).isValid)
        XCTAssertFalse(ProjectFormModel(name: "App", sourceValue: "/tmp/app", agentIds: ["codex", "claude"], leadAgentId: "cursor").isValid)
        XCTAssertEqual(ProjectFormModel(name: "App", sourceValue: "/tmp/app", agentIds: ["codex"], leadAgentId: "claude").normalizedLeadAgentId, "codex")
    }

    func testSetAgentKeepsLeadConsistent() {
        var form = ProjectFormModel(name: "App", sourceValue: "/tmp/app")

        form.setAgent("claude", enabled: true)
        form.leadAgentId = "claude"
        XCTAssertTrue(form.isValid)

        form.setAgent("claude", enabled: false)
        XCTAssertEqual(form.normalizedAgentIds, ["codex"])
        XCTAssertEqual(form.normalizedLeadAgentId, "codex")
        XCTAssertTrue(form.isValid)
    }
}
