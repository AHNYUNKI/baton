import AppKit
import BatonKit
import Foundation
import SwiftUI

@main
struct BatonApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var appModel = BatonAppModel()
    @State private var isShowingNewRun = false
    @State private var isShowingNewProject = false
    @State private var isShowingSettings = false
    @State private var sidebarSection: SidebarSection = .runs
    @State private var projectRefreshToken = UUID()
    @State private var selectedProject: Project?

    var body: some Scene {
        WindowGroup {
            NavigationSplitView {
                VStack(spacing: 0) {
                    Picker("섹션", selection: $sidebarSection) {
                        Label("실행", systemImage: "list.bullet.rectangle").tag(SidebarSection.runs)
                        Label("프로젝트", systemImage: "paperclip").tag(SidebarSection.projects)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .padding([.horizontal, .top], 18)
                    .padding(.bottom, 4)

                    switch sidebarSection {
                    case .runs:
                        RunsListView(store: appModel.store) {
                            isShowingNewRun = true
                        }
                    case .projects:
                        ProjectsListView(
                            client: appModel.makeClient(),
                            refreshKey: "\(appModel.storeGeneration.uuidString)-\(projectRefreshToken.uuidString)",
                            selectedProjectId: selectedProject?.id,
                            onNewProject: {
                                isShowingNewProject = true
                            },
                            onSelectProject: { project in
                                selectedProject = project
                            }
                        )
                    }
                }
            } detail: {
                switch sidebarSection {
                case .runs:
                    RunDetailView(store: appModel.store)
                case .projects:
                    if let selectedProject {
                        ProjectPlanView(project: selectedProject, client: appModel.makeClient()) {
                            projectRefreshToken = UUID()
                        }
                        .id(selectedProject.id)
                    } else {
                        ProjectDetailPlaceholder(onNewProject: {
                            isShowingNewProject = true
                        })
                    }
                }
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
                        sidebarSection = .projects
                        isShowingNewProject = true
                    } label: {
                        Label("새 프로젝트", systemImage: "paperclip")
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
            .sheet(isPresented: $isShowingNewProject) {
                NewProjectView(client: appModel.makeClient()) {
                    sidebarSection = .projects
                    projectRefreshToken = UUID()
                }
            }
            .sheet(isPresented: $isShowingSettings) {
                SettingsView(preference: appModel.batonExecutablePreference) { preference in
                    appModel.updateBatonExecutablePreference(preference)
                }
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

private enum SidebarSection {
    case runs
    case projects
}

private struct ProjectDetailPlaceholder: View {
    let onNewProject: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("프로젝트", systemImage: "paperclip")
                .font(.system(size: 34, weight: .heavy))
                .foregroundStyle(BatonTheme.cream)
            Text("로컬 폴더 또는 GitHub 참조와 함께 사용할 AI 팀을 준비합니다.")
                .font(.title3)
                .foregroundStyle(BatonTheme.muted)
            GradientButton(title: "새 프로젝트", systemImage: "paperclip", action: onNewProject)
        }
        .padding(34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
    }
}
