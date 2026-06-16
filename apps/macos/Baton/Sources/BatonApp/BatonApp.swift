import BatonKit
import SwiftUI

@main
struct BatonApp: App {
    @StateObject private var store = RunsStore()

    var body: some Scene {
        WindowGroup {
            NavigationSplitView {
                RunsListView(store: store)
            } detail: {
                RunDetailView(store: store)
            }
            .frame(minWidth: 900, minHeight: 560)
            .task {
                await store.load()
                store.startWatching()
            }
            .onDisappear {
                store.stopWatching()
            }
        }
    }
}
