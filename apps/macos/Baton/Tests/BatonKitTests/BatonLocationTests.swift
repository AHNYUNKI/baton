import XCTest
@testable import BatonKit

final class BatonLocationTests: XCTestCase {
    func testResolveUsesDefaultBatonWhenPreferenceIsMissing() {
        XCTAssertEqual(BatonLocation.resolve(preference: nil), "baton")
    }

    func testResolveUsesDefaultBatonWhenPreferenceIsBlank() {
        XCTAssertEqual(BatonLocation.resolve(preference: ""), "baton")
        XCTAssertEqual(BatonLocation.resolve(preference: "  \n "), "baton")
    }

    func testResolveUsesTrimmedPreference() {
        XCTAssertEqual(
            BatonLocation.resolve(preference: "  /opt/homebrew/bin/baton  "),
            "/opt/homebrew/bin/baton"
        )
    }
}
