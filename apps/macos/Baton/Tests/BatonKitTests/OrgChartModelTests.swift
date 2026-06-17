import XCTest
@testable import BatonKit

final class OrgChartModelTests: XCTestCase {
    func testBuildOrgChartBuildsNestedTreeAndMapsRoleFields() {
        let plan = TeamPlan(roles: [
            role(id: "manager", name: "Manager", description: "Owns the plan", agentId: "claude", reportsTo: nil),
            role(id: "architect", name: "Architect", description: "Shapes the plan", agentId: "claude", reportsTo: "manager"),
            role(id: "implementer", name: "Implementer", description: "Builds the change", agentId: "codex", reportsTo: "architect"),
            role(id: "tester", name: "Tester", description: "Checks the result", agentId: "codex", reportsTo: "manager")
        ])
        let project = makeProject(agentIds: ["codex", "claude"], leadAgentId: "claude", teamPlan: plan)

        let chart = OrgChartModel.buildOrgChart(
            project: project,
            statusByRole: ["architect": "running", "implementer": "completed"]
        )

        XCTAssertEqual(chart.leadAgentId, "claude")
        XCTAssertTrue(chart.hasPlan)
        XCTAssertEqual(chart.roots.map(\.node.roleId), ["manager"])
        XCTAssertEqual(chart.roots.first?.depth, 0)
        XCTAssertEqual(chart.roots.first?.node.description, "Owns the plan")
        XCTAssertEqual(chart.roots.first?.children.map(\.node.roleId), ["architect", "tester"])
        XCTAssertEqual(chart.roots.first?.children.first?.depth, 1)
        XCTAssertEqual(chart.roots.first?.children.first?.node.reportsTo, "manager")
        XCTAssertEqual(chart.roots.first?.children.first?.children.first?.node.roleId, "implementer")
        XCTAssertEqual(chart.roots.first?.children.first?.children.first?.depth, 2)

        let flattened = flatten(chart.roots)
        XCTAssertEqual(flattened.map(\.node.assignedAgentId), ["claude", "claude", "codex", "codex"])
        XCTAssertEqual(flattened.map(\.node.status), ["planned", "running", "completed", "planned"])
    }

    func testLegacyFlatPlanWithoutReportsToBuildsRepresentativeRoots() {
        let project = makeProject(
            agentIds: ["codex", "claude"],
            leadAgentId: "claude",
            teamPlan: TeamPlan(roles: [
                role(id: "designer", name: "Designer", agentId: "claude"),
                role(id: "builder", name: "Builder", agentId: "codex")
            ])
        )

        let chart = OrgChartModel.buildOrgChart(project: project)

        XCTAssertTrue(chart.hasPlan)
        XCTAssertEqual(chart.roots.map(\.node.roleId), ["designer", "builder"])
        XCTAssertEqual(chart.roots.map(\.depth), [0, 0])
        XCTAssertTrue(chart.roots.allSatisfy { $0.node.reportsTo == nil && $0.children.isEmpty })
    }

    func testMissingParentFallsBackToRepresentativeRoot() {
        let project = makeProject(
            agentIds: ["codex", "claude"],
            leadAgentId: "claude",
            teamPlan: TeamPlan(roles: [
                role(id: "manager", name: "Manager", agentId: "claude"),
                role(id: "builder", name: "Builder", agentId: "codex", reportsTo: "missing"),
                role(id: "reviewer", name: "Reviewer", agentId: "claude", reportsTo: "manager")
            ])
        )

        let chart = OrgChartModel.buildOrgChart(project: project)

        XCTAssertEqual(chart.roots.map(\.node.roleId), ["manager", "builder"])
        XCTAssertNil(chart.roots[1].node.reportsTo)
        XCTAssertEqual(chart.roots[0].children.map(\.node.roleId), ["reviewer"])
    }

    func testSelfReferenceAndCycleParticipantsFallBackToRepresentativeRoots() {
        let project = makeProject(
            agentIds: ["codex", "claude"],
            leadAgentId: "claude",
            teamPlan: TeamPlan(roles: [
                role(id: "self", name: "Self", agentId: "codex", reportsTo: "self"),
                role(id: "manager", name: "Manager", agentId: "claude", reportsTo: "reviewer"),
                role(id: "reviewer", name: "Reviewer", agentId: "claude", reportsTo: "manager"),
                role(id: "builder", name: "Builder", agentId: "codex", reportsTo: "manager")
            ])
        )

        let chart = OrgChartModel.buildOrgChart(project: project)

        XCTAssertEqual(chart.roots.map(\.node.roleId), ["self", "manager", "reviewer"])
        XCTAssertTrue(chart.roots.allSatisfy { $0.node.reportsTo == nil })
        XCTAssertEqual(chart.roots[1].children.map(\.node.roleId), ["builder"])
        XCTAssertEqual(chart.roots[1].children.first?.depth, 1)
        XCTAssertEqual(chart.roots[1].children.first?.node.reportsTo, "manager")
    }

    func testMissingTeamPlanProducesEmptyPlanState() {
        let project = makeProject(agentIds: ["codex"], leadAgentId: "codex", teamPlan: nil)

        let chart = OrgChartModel.buildOrgChart(project: project)

        XCTAssertEqual(chart.leadAgentId, "codex")
        XCTAssertFalse(chart.hasPlan)
        XCTAssertTrue(chart.roots.isEmpty)
    }

    func testSingleAgentBecomesLeadWhenProjectLeadIsMissing() {
        let project = makeProject(
            agentIds: ["codex"],
            leadAgentId: nil,
            teamPlan: TeamPlan(roles: [
                role(id: "solo", name: "Solo", agentId: "codex")
            ])
        )

        let chart = OrgChartModel.buildOrgChart(project: project)

        XCTAssertEqual(chart.leadAgentId, "codex")
        XCTAssertEqual(chart.roots.first?.node.assignedAgentId, "codex")
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

    private func role(
        id: String,
        name: String,
        description: String = "",
        agentId: String,
        reportsTo: String? = nil
    ) -> TeamRole {
        TeamRole(
            id: id,
            name: name,
            description: description,
            assignedAgentId: agentId,
            instructions: "",
            reportsTo: reportsTo
        )
    }

    private func flatten(_ nodes: [OrgChartTreeNode]) -> [OrgChartTreeNode] {
        nodes.flatMap { node in
            [node] + flatten(node.children)
        }
    }
}
