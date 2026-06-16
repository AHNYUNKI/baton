import XCTest
@testable import BatonKit

final class StatusDisplayTests: XCTestCase {
    func testRunStatusKoreanLabelsAndTints() {
        XCTAssertEqual(StatusDisplay.koreanLabel(RunStatus.planned), "대기")
        XCTAssertEqual(StatusDisplay.koreanLabel(RunStatus.running), "실행 중")
        XCTAssertEqual(StatusDisplay.koreanLabel(RunStatus.awaitingApproval), "승인 대기")
        XCTAssertEqual(StatusDisplay.koreanLabel(RunStatus.completed), "완료")
        XCTAssertEqual(StatusDisplay.koreanLabel(RunStatus.failed), "실패")
        XCTAssertEqual(StatusDisplay.koreanLabel(RunStatus.cancelled), "취소됨")

        XCTAssertEqual(StatusDisplay.tint(RunStatus.running), .running)
        XCTAssertEqual(StatusDisplay.tint(RunStatus.awaitingApproval), .awaitingApproval)
        XCTAssertEqual(StatusDisplay.tint(RunStatus.completed), .completed)
        XCTAssertEqual(StatusDisplay.tint(RunStatus.failed), .failed)
        XCTAssertEqual(StatusDisplay.tint(RunStatus.cancelled), .muted)
        XCTAssertEqual(StatusDisplay.tint(RunStatus.planned), .planned)
    }

    func testStepAndApprovalStatusLabelsIncludeSkippedAndApprovalStates() {
        XCTAssertEqual(StatusDisplay.koreanLabel(RunStepStatus.skipped), "건너뜀")
        XCTAssertEqual(StatusDisplay.tint(RunStepStatus.skipped), .muted)
        XCTAssertEqual(StatusDisplay.koreanLabel(ApprovalStatus.pending), "승인 대기")
        XCTAssertEqual(StatusDisplay.koreanLabel(ApprovalStatus.approved), "승인됨")
        XCTAssertEqual(StatusDisplay.koreanLabel(ApprovalStatus.rejected), "거부됨")
    }

    func testRoleLabelsAndTints() {
        XCTAssertEqual(RoleDisplay.koreanLabel(role: "analyst"), "분석")
        XCTAssertEqual(RoleDisplay.koreanLabel(role: "architect"), "설계")
        XCTAssertEqual(RoleDisplay.koreanLabel(role: "implementer"), "구현")
        XCTAssertEqual(RoleDisplay.koreanLabel(role: "tester"), "테스트")
        XCTAssertEqual(RoleDisplay.koreanLabel(role: "reviewer"), "리뷰")
        XCTAssertEqual(RoleDisplay.koreanLabel(role: "fixer"), "수정")
        XCTAssertEqual(RoleDisplay.koreanLabel(role: "release_writer"), "릴리스")
        XCTAssertEqual(RoleDisplay.koreanLabel(stepType: .approve), "승인")
        XCTAssertEqual(RoleDisplay.tint(role: "unknown"), .muted)
        XCTAssertEqual(RoleDisplay.tint(stepType: .implement).name, "implementer")
    }
}
