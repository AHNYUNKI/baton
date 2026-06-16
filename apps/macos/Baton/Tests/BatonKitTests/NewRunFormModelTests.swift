import XCTest
@testable import BatonKit

final class NewRunFormModelTests: XCTestCase {
    func testDefaultFormBuildsEmptyOptions() {
        let form = NewRunFormModel()

        XCTAssertFalse(form.isValid)
        XCTAssertEqual(form.buildOptions(), StartRunOptions())
    }

    func testRequestValidationTrimsWhitespace() {
        XCTAssertFalse(NewRunFormModel(request: "").isValid)
        XCTAssertFalse(NewRunFormModel(request: "   \n").isValid)
        XCTAssertTrue(NewRunFormModel(request: "  새 기능 구현  ").isValid)
    }

    func testBuildOptionsMapsAllConfiguredValues() {
        let form = NewRunFormModel(
            request: "Build",
            dryRun: true,
            useCodex: true,
            useClaude: false,
            useTest: true,
            testCommand: "  pnpm test  ",
            fixEnabled: false,
            maxFixAttemptsText: " 3 ",
            workflowId: " default ",
            projectId: " app "
        )

        XCTAssertEqual(
            form.buildOptions(),
            StartRunOptions(
                dryRun: true,
                workflowId: "default",
                projectId: "app",
                useCodex: true,
                useClaude: false,
                useTest: true,
                testCommand: "pnpm test",
                fixEnabled: false,
                maxFixAttempts: 3
            )
        )
    }

    func testMaxFixAttemptsEmptyInputMapsToNil() {
        let form = NewRunFormModel(request: "Build", maxFixAttemptsText: "   ")

        XCTAssertTrue(form.isMaxFixAttemptsValid)
        XCTAssertNil(form.maxFixAttempts)
        XCTAssertNil(form.buildOptions().maxFixAttempts)
    }

    func testInvalidMaxFixAttemptsBlocksSubmitAndDoesNotEmitOption() {
        let form = NewRunFormModel(request: "Build", maxFixAttemptsText: "-1")

        XCTAssertTrue(form.isValid)
        XCTAssertFalse(form.canSubmit)
        XCTAssertFalse(form.isMaxFixAttemptsValid)
        XCTAssertNil(form.buildOptions().maxFixAttempts)
    }
}
