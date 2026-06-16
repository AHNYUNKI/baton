import BatonKit
import Foundation
import SwiftUI

@main
struct BatonApp: App {
    @StateObject private var appModel = BatonAppModel()
    @State private var isShowingNewRun = false
    @State private var isShowingSettings = false

    var body: some Scene {
        WindowGroup {
            NavigationSplitView {
                RunsListView(store: appModel.store) {
                    isShowingNewRun = true
                }
            } detail: {
                RunDetailView(store: appModel.store)
            }
            .frame(minWidth: 900, minHeight: 560)
            .background(BatonTheme.background)
            .preferredColorScheme(.dark)
            .task(id: appModel.storeGeneration) {
                await appModel.loadAndWatch()
            }
            .onDisappear {
                appModel.stopWatching()
            }
            .toolbar {
                ToolbarItemGroup {
                    Button {
                        isShowingNewRun = true
                    } label: {
                        Label("새 실행", systemImage: "plus.circle")
                    }

                    Button {
                        isShowingSettings = true
                    } label: {
                        Label("설정", systemImage: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $isShowingNewRun) {
                NewRunView(store: appModel.store)
            }
            .sheet(isPresented: $isShowingSettings) {
                SettingsView(preference: appModel.batonExecutablePreference) { preference in
                    appModel.updateBatonExecutablePreference(preference)
                }
            }
        }
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
}
