import XCTest
@testable import BatonKit

final class AppNavigationModelTests: XCTestCase {
    func testInitialStateDefaultsToDashboardAndOverview() {
        let model = AppNavigationModel()

        XCTAssertEqual(model.section, .dashboard)
        XCTAssertEqual(model.projectTab, .overview)
        XCTAssertNil(model.selectedProjectId)
    }

    func testSectionTransitionsUpdateSelection() {
        var model = AppNavigationModel()

        XCTAssertTrue(model.select(.runs))
        XCTAssertEqual(model.section, .runs)

        XCTAssertTrue(model.select(.inbox))
        XCTAssertEqual(model.section, .inbox)

        XCTAssertTrue(model.select(.agents))
        XCTAssertEqual(model.section, .agents)

        XCTAssertTrue(model.select(.settings))
        XCTAssertEqual(model.section, .settings)
    }

    func testSelectingProjectStoresProjectIdAndDefaultsToOverviewTab() {
        var model = AppNavigationModel()

        XCTAssertTrue(model.selectProject(id: " project-a "))

        XCTAssertEqual(model.section, .project(id: "project-a"))
        XCTAssertEqual(model.selectedProjectId, "project-a")
        XCTAssertEqual(model.projectTab, .overview)
    }

    func testProjectTabCanChangeAndSurvivesTemporarySectionSwitch() {
        var model = AppNavigationModel()

        XCTAssertTrue(model.selectProject(id: "project-a"))
        XCTAssertTrue(model.selectTab(.org))
        XCTAssertEqual(model.projectTab, .org)

        XCTAssertTrue(model.select(.runs))
        XCTAssertEqual(model.section, .runs)
        XCTAssertEqual(model.selectedProjectId, "project-a")
        XCTAssertEqual(model.projectTab, .org)

        XCTAssertTrue(model.returnToSelectedProject())
        XCTAssertEqual(model.section, .project(id: "project-a"))
        XCTAssertEqual(model.projectTab, .org)
    }

    func testInvalidProjectSelectionIsIgnored() {
        var model = AppNavigationModel()

        XCTAssertFalse(model.selectProject(id: "   "))
        XCTAssertEqual(model.section, .dashboard)
        XCTAssertNil(model.selectedProjectId)
        XCTAssertFalse(model.selectTab(.plan))
        XCTAssertEqual(model.projectTab, .overview)
    }
}
