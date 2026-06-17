import XCTest
@testable import BatonKit

final class TeamPlanEditModelTests: XCTestCase {
    func testAddEditAssignRemoveAndSerializeRoles() throws {
        var model = TeamPlanEditModel(agentIds: ["codex", "claude"])

        XCTAssertFalse(model.isValid)
        model.addRole()
        XCTAssertEqual(model.roles.map(\.id), ["role-1"])
        XCTAssertTrue(model.updateAssignedAgent(roleId: "role-1", agentId: "claude"))
        model.roles[0].name = "Architect"
        model.roles[0].description = "Designs the change"
        model.roles[0].instructions = "Write a small design."

        XCTAssertTrue(model.isValid)
        let plan = try model.toTeamPlan()
        XCTAssertEqual(plan.roles.first?.assignedAgentId, "claude")
        XCTAssertTrue(try model.toJSON().contains(#""assignedAgentId":"claude""#))

        model.removeRole(id: "role-1")
        XCTAssertTrue(model.roles.isEmpty)
        XCTAssertFalse(model.isValid)
    }

    func testRejectsInvalidNamesDuplicateIdsAndUnknownAgents() {
        var model = TeamPlanEditModel(
            agentIds: ["codex"],
            plan: TeamPlan(roles: [
                TeamRole(id: "planner", name: "Planner", description: "", assignedAgentId: "codex", instructions: ""),
                TeamRole(id: "planner", name: "Reviewer", description: "", assignedAgentId: "codex", instructions: "")
            ])
        )

        XCTAssertFalse(model.isValid)
        model.roles[1].id = "reviewer"
        XCTAssertTrue(model.isValid)

        model.roles[0].name = "   "
        XCTAssertFalse(model.isValid)
        model.roles[0].name = "Planner"

        model.roles[0].assignedAgentId = "claude"
        XCTAssertFalse(model.isValid)
        XCTAssertFalse(model.updateAssignedAgent(roleId: "planner", agentId: "claude"))
        XCTAssertTrue(model.updateAssignedAgent(roleId: "planner", agentId: "codex"))
        XCTAssertTrue(model.isValid)
    }

    func testToTeamPlanThrowsWhenInvalid() {
        let model = TeamPlanEditModel(agentIds: ["codex"])

        XCTAssertThrowsError(try model.toTeamPlan()) { error in
            XCTAssertEqual(error as? TeamPlanEditModelError, .invalidPlan)
        }
    }
}
