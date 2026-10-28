import XCTest

final class ToiletStoreUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication(bundleIdentifier: "com.sharetoilet.app")
        app.launch()
        XCTAssertTrue(app.webViews.textFields.firstMatch.waitForExistence(timeout: 30))
    }

    private func search(_ text: String) {
        let field = app.webViews.textFields.firstMatch
        XCTAssertTrue(field.isEnabled)
        field.tap()
        field.typeText(text)
        app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)).tap()
    }

    func testRegionalSearchAndPanel() {
        search("강남구")
        let result = app.webViews.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "강남구")).firstMatch
        XCTAssertTrue(result.waitForExistence(timeout: 15), "Regional search should show matching facility data")
        let expand = app.buttons["목록 펼치기"]
        XCTAssertTrue(expand.exists)
        expand.tap()
        XCTAssertTrue(app.buttons["목록 접기"].exists)
        app.buttons["목록 접기"].tap()
        XCTAssertTrue(app.buttons["목록 펼치기"].exists)
        XCTAssertFalse(app.buttons["광고 로그"].exists, "The iOS build has no advertising SDK")
        XCTAssertTrue(app.links["고객지원"].exists)
    }

    func testMapSelectionAndRouteControls() {
        search("서울시청")
        let place = app.webViews.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "서울시청 본관 B1층 시민청 출입구")).firstMatch
        XCTAssertTrue(place.waitForExistence(timeout: 15))
        place.tap()
        let route = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "경로추가")).firstMatch
        XCTAssertTrue(route.waitForExistence(timeout: 20), "A rendered map must open the selected facility's information card")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "사용가능")).firstMatch.exists)
        route.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "경로보기")).firstMatch.waitForExistence(timeout: 10))
    }
}
