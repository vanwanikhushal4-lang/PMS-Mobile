import XCTest

final class KickoffFlow: XCTestCase {
    @MainActor
    func testScheduleMeetingAndOpenAgenda() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.velox.scm.mobile.qa")
        app.terminate()
        app.launch()

        if !app.buttons["open-sign-in"].waitForExistence(timeout: 5) {
            tap(app, "tab-profile")
            tap(app, "workspace-sign-out")
        }
        tap(app, "open-sign-in")
        type(app.textFields["auth-company"], "QA-A", sequential: true)
        type(app.textFields["auth-username"], "kickoff-director")
        type(app.secureTextFields["auth-password"], "Stage-only-password-28")
        tap(app, "auth-submit")

        let projects = app.descendants(matching: .any)["tab-projects"].firstMatch
        XCTAssertTrue(projects.waitForExistence(timeout: 15), "The signed-in tab bar did not appear")
        snapshot("PMS Projects with system tab bar")
        tap(app, "tab-service")
        XCTAssertTrue(app.staticTexts["Service desk"].waitForExistence(timeout: 10))
        tap(app, "tab-projects")
        tap(app, "project-44")
        tap(app, "Details for UD-71")
        tap(app, "open-kickoff")
        XCTAssertTrue(app.staticTexts["Schedule kickoff"].firstMatch.waitForExistence(timeout: 10))
        snapshot("PMS kickoff with Liquid Glass controls")

        type(app.textFields["kickoff-date"], "2026-11-25", sequential: true)
        type(app.textFields["kickoff-time"], "10:30", sequential: true)
        tap(app, "workspace-virtual")
        tap(app, "Microsoft Teams")
        let connection = app.descendants(matching: .any)["kickoff-connection"].firstMatch
        type(connection, "https://meet.fixture.invalid/pms")
        // An unhandled label tap dismisses the multiline field's keyboard.
        app.staticTexts["Meeting link or credentials"].firstMatch.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5), "The meeting keyboard did not dismiss")
        if let scroll = mainScroll(in: app) { scroll.swipeUp() }
        tap(app, "kickoff-person-15")
        tap(app, "workspace-sales team")
        tap(app, "kickoff-person-18")
        tap(app, "workspace-managers")
        tap(app, "kickoff-person-13")
        tap(app, "kickoff-agenda")
        pickAgenda(in: app)

        let selected = app.staticTexts["PMS simulator agenda.pdf"].firstMatch
        XCTAssertTrue(selected.waitForExistence(timeout: 10), "The selected agenda is missing")
        tap(app, "submit-kickoff")
        XCTAssertTrue(app.staticTexts["Meeting Scheduled"].firstMatch.waitForExistence(timeout: 20), "The saved meeting did not open")
        XCTAssertTrue(app.staticTexts["https://meet.fixture.invalid/pms"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Riya Naik"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Meera Shah"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Samira Rao"].firstMatch.exists)
        snapshot("PMS scheduled meeting")

        tap(app, "attachment-kickoff-agenda")
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH %@", "PMS simulator agenda"))
            .firstMatch.waitForExistence(timeout: 15), "The agenda name is missing from the share sheet")
        XCTAssertTrue(app.buttons.containing(NSPredicate(format: "label == %@", "Save to Files")).firstMatch.exists
            || app.staticTexts["Save to Files"].exists, "The native share sheet did not open")
        snapshot("PMS native agenda share sheet")
    }

    @MainActor
    private func type(_ element: XCUIElement, _ text: String, sequential: Bool = false) {
        XCTAssertTrue(element.waitForExistence(timeout: 10))
        element.tap()
        if sequential {
            for character in text { element.typeText(String(character)) }
        } else {
            element.typeText(text)
        }
        if element.elementType != .secureTextField {
            XCTAssertEqual(element.value as? String, text, element.debugDescription)
        }
    }

    @MainActor
    private func tap(_ app: XCUIApplication, _ identifier: String) {
        let element = app.descendants(matching: .any).matching(NSPredicate(
            format: "identifier == %@ OR label == %@", identifier, identifier
        )).firstMatch
        XCTAssertTrue(element.waitForExistence(timeout: 12), "Missing \(identifier)")
        for _ in 0..<8 where !element.isHittable {
            guard let scroll = mainScroll(in: app) else { break }
            let upward = element.frame.midY >= scroll.frame.minY + 40
            let start = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: upward ? 0.65 : 0.35))
            let end = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: upward ? 0.35 : 0.65))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        XCTAssertTrue(element.isHittable, "Cannot tap \(identifier)")
        element.tap()
    }

    @MainActor
    private func mainScroll(in app: XCUIApplication) -> XCUIElement? {
        app.scrollViews.allElementsBoundByIndex.filter { $0.frame.height > 150 }
            .max { $0.frame.height < $1.frame.height }
    }

    @MainActor
    private func pickAgenda(in app: XCUIApplication) {
        let file = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "PMS simulator agenda")).firstMatch
        if !file.waitForExistence(timeout: 15) {
            tap(app, "Browse")
            // Files runs in a separate process; wait for its next hierarchy
            // before issuing another navigation tap during the transition.
            if !file.waitForExistence(timeout: 12) {
                let localFiles = app.staticTexts["On My iPhone"].firstMatch
                if !localFiles.waitForExistence(timeout: 3) { tap(app, "Browse") }
                if !file.waitForExistence(timeout: 3) {
                    tap(app, "On My iPhone")
                    if !file.waitForExistence(timeout: 5) { tap(app, "PMS QA") }
                }
            }
        }
        XCTAssertTrue(file.waitForExistence(timeout: 15), "The sample agenda is missing from Files")
        file.tap()
    }

    @MainActor
    private func snapshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
