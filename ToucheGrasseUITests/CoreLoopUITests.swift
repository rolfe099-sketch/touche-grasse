import XCTest

final class CoreLoopUITests: XCTestCase {
    func testFindLogRepeatAndRelaunch() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing", "--reset-test-data"]
        app.launch()
        let add = app.buttons["today.add"]
        XCTAssertTrue(add.waitForExistence(timeout: 30)); add.tap()
        let search = app.textFields["entry.search"]
        XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("olivenolje")
        let oil = app.buttons["entry.result.mvt:08.019"]
        XCTAssertTrue(oil.waitForExistence(timeout: 10)); oil.tap()
        let commit = app.buttons["entry.commit"]
        XCTAssertTrue(commit.isEnabled); commit.tap()
        let repeatButton = app.buttons.matching(identifier: "log.repeat").firstMatch
        XCTAssertTrue(repeatButton.waitForExistence(timeout: 10)); repeatButton.tap()
        XCTAssertTrue(app.buttons["Angre"].waitForExistence(timeout: 5))
        app.terminate()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        XCTAssertTrue(app.buttons.matching(identifier: "log.repeat").firstMatch.waitForExistence(timeout: 30))
    }
}
