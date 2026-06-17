import XCTest
@testable import BatonKit

final class OrgChartModelTests: XCTestCase {
    func testBuildOrgChartMapsLeadAndTeamPlanRoles() {
        let project = makeProject(
            agentIds: ["codex", "claude"],
            leadAgentId: "claude",
            teamPlan: TeamPlan(roles: [
                TeamRole(
                    id: "designer",
                    name: "Designer",
                    description: "Shapes the plan",
                    assignedAgentId: "claude",
                    instructions: "Design carefully."
                ),
                TeamRole(
                    id: "implementer",
                    name: "Implementer",
                    description: "Builds the change",
                    assignedAgentId: "codex",
                    instructions: "Keep changes small."
                )
            ])
        )

        let chart = OrgChartModel.buildOrgChart(project: project)

        XCTAssertEqual(chart.leadAgentId, "claude")
        XCTAssertTrue(chart.hasPlan)
        XCTAssertEqual(chart.nodes.map(\.roleId), ["designer", "implementer"])
        XCTAssertEqual(chart.nodes.map(\.name), ["Designer", "Implementer"])
        XCTAssertEqual(chart.nodes.map(\.assignedAgentId), ["claude", "codex"])
        XCTAssertEqual(chart.nodes.map(\.status), ["planned", "planned"])
    }

    func testMissingTeamPlanProducesEmptyPlanState() {
        let project = makeProject(agentIds: ["codex"], leadAgentId: "codex", teamPlan: nil)

        let chart = OrgChartModel.buildOrgChart(project: project)

        XCTAssertEqual(chart.leadAgentId, "codex")
        XCTAssertFalse(chart.hasPlan)
        XCTAssertTrue(chart.nodes.isEmpty)
    }

    func testSingleAgentBecomesLeadWhenProjectLeadIsMissing() {
        let project = makeProject(
            agentIds: ["codex"],
            leadAgentId: nil,
            teamPlan: TeamPlan(roles: [
                TeamRole(
                    id: "solo",
                    name: "Solo",
                    description: "",
                    assignedAgentId: "codex",
                    instructions: ""
                )
            ])
        )

        let chart = OrgChartModel.buildOrgChart(project: project)

        XCTAssertEqual(chart.leadAgentId, "codex")
        XCTAssertEqual(chart.nodes.first?.assignedAgentId, "codex")
    }

    func testStatusByRoleOverridesDefaultStatus() {
        let plan = TeamPlan(roles: [
            TeamRole(
                id: "planner",
                name: "Planner",
                description: "",
                assignedAgentId: "claude",
                instructions: ""
            ),
            TeamRole(
                id: "builder",
                name: "Builder",
                description: "",
                assignedAgentId: "codex",
                instructions: ""
            )
        ])
        let project = makeProject(agentIds: ["codex", "claude"], leadAgentId: "claude", teamPlan: nil)

        let chart = OrgChartModel.buildOrgChart(
            project: project,
            teamPlan: plan,
            statusByRole: ["planner": "running"]
        )

        XCTAssertEqual(chart.nodes.map(\.status), ["running", "planned"])
    }

    private func makeProject(
        agentIds: [String],
        leadAgentId: String?,
        teamPlan: TeamPlan?
    ) -> Project {
        Project(
            id: "project-a",
            name: "Project A",
            source: ProjectSource(kind: .local, value: "/tmp/project-a"),
            agentIds: agentIds,
            leadAgentId: leadAgentId,
            overview: "Build a small thing.",
            teamPlan: teamPlan,
            createdAt: "2026-06-17T00:00:00.000Z"
        )
    }
}
