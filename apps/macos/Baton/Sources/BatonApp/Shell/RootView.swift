import BatonKit
import SwiftUI

struct RootView: View {
    @ObservedObject var store: RunsStore
    let storeGeneration: UUID
    let batonExecutablePreference: String
    let makeClient: () -> BatonClient
    let updateBatonExecutablePreference: (String) -> Void

    @State private var navigation = AppNavigationModel()
    @State private var projects: [Project] = []
    @State private var isLoadingProjects = false
    @State private var projectErrorMessage: String?
    @State private var projectRefreshToken = UUID()
    @State private var isShowingNewRun = false
    @State private var isShowingNewProject = false
    @State private var isShowingSettings = false

    var body: some View {
        HSplitView {
            SidebarView(
                navigation: $navigation,
                projects: projects,
                runs: store.runs,
                state: store.state,
                isLoadingProjects: isLoadingProjects,
                projectErrorMessage: projectErrorMessage,
                selectedProject: selectedProjectForSidebar,
                onNewRun: {
                    isShowingNewRun = true
                },
                onNewProject: {
                    isShowingNewProject = true
                },
                onRefreshProjects: {
                    projectRefreshToken = UUID()
                },
                onOpenSettings: {
                    navigation.select(.settings)
                }
            )
            .frame(minWidth: 280, idealWidth: 310, maxWidth: 360, maxHeight: .infinity)

            mainContent
                .frame(minWidth: 620, maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 980, minHeight: 620)
        .background(BatonTheme.background)
        .preferredColorScheme(.dark)
        .task(id: projectRefreshKey) {
            await loadProjects()
        }
        .toolbar {
            ToolbarItemGroup {
                Button {
                    isShowingNewRun = true
                } label: {
                    Label("새 실행", systemImage: "plus.circle")
                }

                Button {
                    isShowingNewProject = true
                } label: {
                    Label("새 프로젝트", systemImage: "paperclip")
                }

                Button {
                    refreshAll()
                } label: {
                    Label("새로고침", systemImage: "arrow.clockwise")
                }
                .disabled(store.isLoading || isLoadingProjects)

                Button {
                    isShowingSettings = true
                } label: {
                    Label("설정", systemImage: "gearshape")
                }
            }
        }
        .sheet(isPresented: $isShowingNewRun) {
            NewRunView(store: store)
        }
        .sheet(isPresented: $isShowingNewProject) {
            NewProjectView(client: makeClient()) {
                projectRefreshToken = UUID()
            }
        }
        .sheet(isPresented: $isShowingSettings) {
            SettingsView(preference: batonExecutablePreference) { preference in
                updateBatonExecutablePreference(preference)
            }
        }
    }

    @ViewBuilder
    private var mainContent: some View {
        switch navigation.section {
        case .dashboard:
            DashboardView(
                state: store.state,
                runs: store.runs,
                projects: projects,
                onSelectRun: { runId in
                    Task {
                        await store.select(runId: runId)
                        navigation.select(.runs)
                    }
                },
                onSelectProject: { project in
                    navigation.selectProject(id: project.id)
                },
                onNewRun: {
                    isShowingNewRun = true
                },
                onNewProject: {
                    isShowingNewProject = true
                }
            )

        case .inbox:
            InboxView(store: store) {
                navigation.select(.runs)
            }

        case .runs:
            HStack(spacing: 0) {
                RunsListView(store: store) {
                    isShowingNewRun = true
                }

                Rectangle()
                    .fill(BatonTheme.separator)
                    .frame(width: 1)

                RunDetailView(store: store)
            }
            .background(BatonTheme.background)

        case let .project(id):
            if let project = projects.first(where: { $0.id == id }) {
                ProjectDetailView(
                    project: project,
                    batonExecutablePreference: batonExecutablePreference,
                    selectedTab: Binding(
                        get: { navigation.projectTab },
                        set: { navigation.selectTab($0) }
                    ),
                    onSaved: {
                        projectRefreshToken = UUID()
                    }
                )
                .id("\(project.id)-\(projectRefreshToken.uuidString)")
            } else {
                ProjectEmptyView(
                    title: "프로젝트를 찾을 수 없습니다",
                    message: "프로젝트 목록을 새로고침하거나 새 프로젝트를 만들어 주세요.",
                    onNewProject: {
                        isShowingNewProject = true
                    },
                    onRefresh: {
                        projectRefreshToken = UUID()
                    }
                )
            }

        case .agents:
            AgentsView(
                project: selectedProjectForSidebar,
                projects: projects,
                onSelectProjectOrg: { project in
                    navigation.selectProject(id: project.id)
                    navigation.selectTab(.org)
                },
                onNewProject: {
                    isShowingNewProject = true
                }
            )

        case .settings:
            SettingsHomeView(
                preference: batonExecutablePreference,
                onOpenSettings: {
                    isShowingSettings = true
                }
            )
        }
    }

    private var projectRefreshKey: String {
        "\(storeGeneration.uuidString)-\(projectRefreshToken.uuidString)"
    }

    private var selectedProjectForSidebar: Project? {
        if let selectedProjectId = navigation.selectedProjectId,
           let project = projects.first(where: { $0.id == selectedProjectId }) {
            return project
        }
        return projects.first
    }

    private func refreshAll() {
        projectRefreshToken = UUID()
        Task {
            await store.load()
        }
    }

    @MainActor
    private func loadProjects() async {
        isLoadingProjects = true
        defer { isLoadingProjects = false }

        do {
            let loadedProjects = try await makeClient().listProjects().sorted { left, right in
                if left.createdAt != right.createdAt {
                    return left.createdAt > right.createdAt
                }
                return left.name < right.name
            }
            projects = loadedProjects
            projectErrorMessage = nil

            if case let .project(id) = navigation.section,
               !loadedProjects.contains(where: { $0.id == id }) {
                if let firstProject = loadedProjects.first {
                    navigation.selectProject(id: firstProject.id)
                } else {
                    navigation.select(.dashboard)
                }
            }
        } catch {
            projectErrorMessage = error.localizedDescription
        }
    }
}

private struct DashboardView: View {
    let state: StateSnapshot?
    let runs: [RunSummary]
    let projects: [Project]
    let onSelectRun: (String) -> Void
    let onSelectProject: (Project) -> Void
    let onNewRun: () -> Void
    let onNewProject: () -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                metricGrid
                recentRunsSection
                projectSection
            }
            .padding(30)
            .frame(maxWidth: 1060, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Label("대시보드", systemImage: "paperclip")
                    .font(.system(size: 34, weight: .heavy))
                    .foregroundStyle(BatonTheme.cream)
                Text("실행, 승인, 프로젝트 팀 구성을 한 곳에서 확인합니다.")
                    .font(.title3)
                    .foregroundStyle(BatonTheme.muted)
            }

            Spacer()

            GradientButton(title: "새 실행", systemImage: "plus", action: onNewRun)
            GradientButton(title: "새 프로젝트", systemImage: "paperclip", action: onNewProject)
        }
    }

    private var metricGrid: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            metricCard(title: "전체 실행", value: "\(state?.total ?? runs.count)", systemImage: "list.bullet.rectangle")
            metricCard(title: "승인 대기", value: "\(runs.filter { $0.status == .awaitingApproval }.count)", systemImage: "exclamationmark.circle")
            metricCard(title: "프로젝트", value: "\(projects.count)", systemImage: "folder")
        }
    }

    private var recentRunsSection: some View {
        section(title: "최근 실행") {
            let recentRuns = Array(runs.prefix(5))
            if recentRuns.isEmpty {
                emptyText("표시할 실행이 없습니다.")
            } else {
                VStack(spacing: 10) {
                    ForEach(recentRuns) { run in
                        Button {
                            onSelectRun(run.runId)
                        } label: {
                            HStack(spacing: 12) {
                                StatusPill(status: run.status)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(run.runId)
                                        .font(.headline.weight(.bold))
                                        .foregroundStyle(BatonTheme.cream)
                                    Text(run.workflowId)
                                        .font(.caption)
                                        .foregroundStyle(BatonTheme.muted)
                                }
                                Spacer()
                                Text(run.createdAt)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(BatonTheme.muted)
                            }
                            .padding(12)
                            .background(BatonTheme.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var projectSection: some View {
        section(title: "프로젝트") {
            if projects.isEmpty {
                emptyText("등록된 프로젝트가 없습니다.")
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 12)], spacing: 12) {
                    ForEach(projects.prefix(6)) { project in
                        Button {
                            onSelectProject(project)
                        } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                Label(project.name, systemImage: project.source.kind == .local ? "folder" : "link")
                                    .font(.headline.weight(.bold))
                                    .foregroundStyle(BatonTheme.cream)
                                    .lineLimit(2)
                                Text(project.overview?.isEmpty == false ? project.overview ?? "" : project.source.value)
                                    .font(.callout)
                                    .foregroundStyle(BatonTheme.muted)
                                    .lineLimit(3)
                                HStack(spacing: 8) {
                                    if let leadAgentId = project.leadAgentId {
                                        agentPill("대표 \(AgentCatalog.displayName(for: leadAgentId))")
                                    }
                                    agentPill("역할 \(project.teamPlan?.roles.count ?? 0)")
                                }
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
                            .background(BatonTheme.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                                    .stroke(BatonTheme.separator, lineWidth: 1)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func metricCard(title: String, value: String, systemImage: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.title2.weight(.bold))
                .foregroundStyle(BatonTheme.amber)
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(BatonTheme.muted)
                Text(value)
                    .font(.system(size: 28, weight: .heavy))
                    .foregroundStyle(BatonTheme.cream)
            }
            Spacer()
        }
        .padding(16)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }

    private func section<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline.weight(.heavy))
                .foregroundStyle(BatonTheme.cream)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func emptyText(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(BatonTheme.muted)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BatonTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
    }

    private func agentPill(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.bold))
            .foregroundStyle(BatonTheme.cream)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(BatonTheme.surface)
            .clipShape(Capsule())
    }
}

private struct AgentsView: View {
    let project: Project?
    let projects: [Project]
    let onSelectProjectOrg: (Project) -> Void
    let onNewProject: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Label("에이전트", systemImage: "person.3")
                    .font(.system(size: 34, weight: .heavy))
                    .foregroundStyle(BatonTheme.cream)

                if let project {
                    projectAgents(project)
                } else {
                    ProjectEmptyView(
                        title: "표시할 프로젝트가 없습니다",
                        message: "프로젝트를 만들면 대표 AI와 역할별 담당 AI가 여기에 표시됩니다.",
                        onNewProject: onNewProject,
                        onRefresh: {}
                    )
                    .frame(minHeight: 320)
                }
            }
            .padding(30)
            .frame(maxWidth: 880, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
    }

    private func projectAgents(_ project: Project) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(project.name)
                        .font(.title.weight(.heavy))
                        .foregroundStyle(BatonTheme.cream)
                    Text("선택 프로젝트의 AI 구성과 역할 배정을 봅니다.")
                        .font(.callout)
                        .foregroundStyle(BatonTheme.muted)
                }
                Spacer()
                GradientButton(title: "조직도 보기", systemImage: "point.3.connected.trianglepath.dotted") {
                    onSelectProjectOrg(project)
                }
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 12)], spacing: 12) {
                ForEach(project.agentIds, id: \.self) { agentId in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Image(systemName: project.leadAgentId == agentId ? "crown.fill" : "person.crop.circle")
                                .foregroundStyle(project.leadAgentId == agentId ? BatonTheme.amber : BatonTheme.muted)
                            Text(AgentCatalog.displayName(for: agentId))
                                .font(.headline.weight(.bold))
                                .foregroundStyle(BatonTheme.cream)
                            Spacer()
                        }
                        Text(project.leadAgentId == agentId ? "대표 AI" : "담당 AI")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(BatonTheme.muted)
                        let roles = project.teamPlan?.roles.filter { $0.assignedAgentId == agentId } ?? []
                        Text(roles.isEmpty ? "배정된 역할 없음" : roles.map(\.name).joined(separator: " · "))
                            .font(.callout)
                            .foregroundStyle(BatonTheme.cream)
                            .lineLimit(3)
                    }
                    .padding(16)
                    .background(BatonTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                            .stroke(BatonTheme.separator, lineWidth: 1)
                    }
                }
            }

            if projects.count > 1 {
                Text("다른 프로젝트는 왼쪽 프로젝트 목록에서 선택할 수 있습니다.")
                    .font(.footnote)
                    .foregroundStyle(BatonTheme.muted)
            }
        }
    }
}

private struct SettingsHomeView: View {
    let preference: String
    let onOpenSettings: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Label("계정", systemImage: "person.crop.circle")
                .font(.system(size: 34, weight: .heavy))
                .foregroundStyle(BatonTheme.cream)
            Text("로컬 Baton CLI 연결 설정을 관리합니다.")
                .font(.title3)
                .foregroundStyle(BatonTheme.muted)

            VStack(alignment: .leading, spacing: 8) {
                Text("baton 실행 파일")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(BatonTheme.cream)
                Text(BatonLocation.resolve(preference: preference))
                    .font(.body.monospaced())
                    .foregroundStyle(BatonTheme.cream)
                    .textSelection(.enabled)
            }
            .padding(16)
            .background(BatonTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                    .stroke(BatonTheme.separator, lineWidth: 1)
            }

            GradientButton(title: "설정 열기", systemImage: "gearshape", action: onOpenSettings)
            Spacer()
        }
        .padding(34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
    }
}

struct ProjectEmptyView: View {
    let title: String
    let message: String
    let onNewProject: () -> Void
    let onRefresh: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label(title, systemImage: "paperclip")
                .font(.system(size: 30, weight: .heavy))
                .foregroundStyle(BatonTheme.cream)
            Text(message)
                .font(.title3)
                .foregroundStyle(BatonTheme.muted)
            HStack {
                GradientButton(title: "새 프로젝트", systemImage: "paperclip", action: onNewProject)
                Button {
                    onRefresh()
                } label: {
                    Label("새로고침", systemImage: "arrow.clockwise")
                }
            }
        }
        .padding(34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
    }
}
