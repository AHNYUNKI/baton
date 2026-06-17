import AppKit
import BatonKit
import Foundation
import SwiftUI

@main
struct BatonApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appModel = BatonAppModel()

    var body: some Scene {
        WindowGroup {
            RootView(
                store: appModel.store,
                storeGeneration: appModel.storeGeneration,
                batonExecutablePreference: appModel.batonExecutablePreference,
                makeClient: {
                    appModel.makeClient()
                },
                updateBatonExecutablePreference: { preference in
                    appModel.updateBatonExecutablePreference(preference)
                }
            )
            .task(id: appModel.storeGeneration) {
                await appModel.loadAndWatch()
            }
            .onDisappear {
                appModel.stopWatching()
            }
        }
    }
}

private final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}

@MainActor
private final class BatonAppModel: ObservableObject {
    @Published private(set) var store: RunsStore
    @Published private(set) var storeGeneration: UUID
    @Published private(set) var batonExecutablePreference: String

    private let defaults: UserDefaults
    private let preferenceKey = "batonExecutablePath"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let preference = defaults.string(forKey: preferenceKey) ?? ""
        self.batonExecutablePreference = preference
        self.store = RunsStore(client: BatonClient(executable: BatonLocation.resolve(preference: preference)))
        self.storeGeneration = UUID()
    }

    func loadAndWatch() async {
        await store.load()
        store.startWatching()
    }

    func stopWatching() {
        store.stopWatching()
    }

    func updateBatonExecutablePreference(_ preference: String) {
        let trimmed = preference.trimmingCharacters(in: .whitespacesAndNewlines)
        batonExecutablePreference = trimmed
        if trimmed.isEmpty {
            defaults.removeObject(forKey: preferenceKey)
        } else {
            defaults.set(trimmed, forKey: preferenceKey)
        }

        store.stopWatching()
        store = RunsStore(client: BatonClient(executable: BatonLocation.resolve(preference: trimmed)))
        storeGeneration = UUID()
    }

    func makeClient() -> BatonClient {
        BatonClient(executable: BatonLocation.resolve(preference: batonExecutablePreference))
    }
}
