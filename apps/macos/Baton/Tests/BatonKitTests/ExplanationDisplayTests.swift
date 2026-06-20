import XCTest
@testable import BatonKit

final class ExplanationDisplayTests: XCTestCase {
    func testDisplayExplanationRemovesLearningHeadingAfterLeadingBlankLines() {
        let raw = """


          ## 학습 설명

        첫 번째 설명입니다.

        두 번째 설명입니다.

        """

        XCTAssertEqual(displayExplanation(raw), "첫 번째 설명입니다.\n\n두 번째 설명입니다.")
    }

    func testDisplayExplanationTrimsContentWithoutLearningHeading() {
        let raw = """

        일반 설명입니다.

        """

        XCTAssertEqual(displayExplanation(raw), "일반 설명입니다.")
    }

    func testDisplayExplanationOnlyRemovesHeadingWhenItIsFirstContentLine() {
        let raw = """
        먼저 보여야 하는 설명입니다.
        ## 학습 설명
        이 줄도 유지됩니다.
        """

        XCTAssertEqual(displayExplanation(raw), "먼저 보여야 하는 설명입니다.\n## 학습 설명\n이 줄도 유지됩니다.")
    }

    func testDisplayExplanationReturnsEmptyStringForBlankOrHeadingOnlyInput() {
        XCTAssertEqual(displayExplanation(" \n\t\n "), "")
        XCTAssertEqual(displayExplanation("\n## 학습 설명\n"), "")
    }
}
