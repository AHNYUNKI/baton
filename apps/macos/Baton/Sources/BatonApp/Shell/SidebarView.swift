import BatonKit
import SwiftUI

struct SidebarView: View {
    @Binding var navigation: AppNavigationModel
    let projects: [Project]
    let runs: [RunSummary]
    let state: StateSnapshot?
    let isLoadingProjects: Bool
    let projectErrorMessage: String?
    let selectedProject: Project?
    let onNewRun: () -> Void
    let onNewProject: () -> Void
    let onRefreshProjects: () -> Void
    let onOpenSettings: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    brand
                    actionSection
                    workSection
                    projectSection
                    agentsSection
                }
                .padding(16)
            }

            accountSection
                .padding(16)
        }
        .frame(maxHeight: .infinity)
        .background(BatonTheme.backgroundRaised)
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(BatonTheme.separator)
                .frame(width: 1)
        }
    }

    private var brand: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Baton", systemImage: "paperclip")
                .font(.system(size: 28, weight: .heavy))
                .foregroundStyle(BatonTheme.cream)
            Text("AI 팀 오케스트레이션")
                .font(.callout.weight(.semibold))
                .foregroundStyle(BatonTheme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var actionSection: some View {
        sidebarSection("액션") {
            commandButton(title: "새 실행", detail: "요청 작성", systemImage: "plus.circle", action: onNewRun)
            navButton(
                title: "대시보드",
                detail: "\(state?.total ?? runs.count)개 실행",
                systemImage: "chart.xyaxis.line",
                isSelected: navigation.section == .dashboard
            ) {
                navigation.select(.dashboard)
            }
            navButton(
                title: "받은 함",
                detail: "승인 \(inboxRuns(runs).count)",
                systemImage: "tray.full",
                isSelected: navigation.section == .inbox
            ) {
                navigation.select(.inbox)
            }
        }
    }

    private var workSection: some View {
        sidebarSection("작업") {
            navButton(
                title: "실행",
                detail: "\(runs.count)개",
                systemImage: "list.bullet.rectangle",
                isSelected: navigation.section == .runs
            ) {
                navigation.select(.runs)
            }
        }
    }

    private var projectSection: some View {
        sidebarSectionHeader(title: "프로젝트") {
            HStack(spacing: 8) {
                Button {
                    onRefreshProjects()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.plain)
                .foregroundStyle(BatonTheme.muted)
                .disabled(isLoadingProjects)

                Button {
                    onNewProject()
                } label: {
                    Image(systemName: "plus")
                }
                .buttonStyle(.plain)
                .foregroundStyle(BatonTheme.muted)
            }
        } content: {
            if isLoadingProjects && projects.isEmpty {
                sidebarMessage("프로젝트를 불러오는 중입니다.")
            } else if projects.isEmpty {
                commandButton(title: "새 프로젝트", detail: "팀 구성 시작", systemImage: "paperclip", action: onNewProject)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(projects) { project in
                        projectButton(project)
                    }
                }
            }

            if let projectErrorMessage {
                sidebarError(projectErrorMessage)
            }
        }
    }

    private var agentsSection: some View {
        sidebarSection("에이전트") {
            navButton(
                title: "AI 조직",
                detail: selectedProject?.name ?? "프로젝트 없음",
                systemImage: "person.3",
                isSelected: navigation.section == .agents
            ) {
                navigation.select(.agents)
            }

            if let selectedProject {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(selectedProject.agentIds, id: \.self) { agentId in
                        HStack(spacing: 8) {
                            Image(systemName: selectedProject.leadAgentId == agentId ? "crown.fill" : "person.crop.circle")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(selectedProject.leadAgentId == agentId ? BatonTheme.amber : BatonTheme.muted)
                                .frame(width: 16)
                            Text(agentLabel(agentId, leadAgentId: selectedProject.leadAgentId))
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(BatonTheme.cream)
                                .lineLimit(1)
                            Spacer()
                        }
                        .padding(.horizontal, 10)
                    }
                }
            } else {
                sidebarMessage("프로젝트를 만들면 AI 목록이 표시됩니다.")
            }
        }
    }

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Divider()
                .overlay(BatonTheme.separator)
            navButton(
                title: "계정",
                detail: "로컬 CLI",
                systemImage: "person.crop.circle",
                isSelected: navigation.section == .settings
            ) {
                onOpenSettings()
            }
        }
    }

    private func projectButton(_ project: Project) -> some View {
        Button {
            navigation.selectProject(id: project.id)
        } label: {
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .fill(project.teamPlan == nil ? BatonTheme.amber : Color(batonHex: "#22C55E"))
                    .frame(width: 8, height: 8)
                    .padding(.top, 7)

                VStack(alignment: .leading, spacing: 4) {
                    Text(project.name)
                        .font(.callout.weight(.bold))
                        .foregroundStyle(BatonTheme.cream)
                        .lineLimit(2)
                    Text(project.teamPlan == nil ? "계획 필요" : "역할 \(project.teamPlan?.roles.count ?? 0)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(BatonTheme.muted)
                        .lineLimit(1)
                }
                Spacer()
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected(project) ? BatonTheme.surfaceElevated : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(isSelected(project) ? BatonTheme.amber.opacity(0.65) : Color.clear, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }

    private func sidebarSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        sidebarSectionHeader(title: title) {
            EmptyView()
        } content: {
            content()
        }
    }

    private func sidebarSectionHeader<Trailing: View, Content: View>(
        title: String,
        @ViewBuilder trailing: () -> Trailing,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title)
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(BatonTheme.muted)
                    .textCase(.uppercase)
                Spacer()
                trailing()
            }
            content()
        }
    }

    private func navButton(
        title: String,
        detail: String,
        systemImage: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            rowLabel(title: title, detail: detail, systemImage: systemImage, isSelected: isSelected)
        }
        .buttonStyle(.plain)
    }

    private func commandButton(
        title: String,
        detail: String,
        systemImage: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            rowLabel(title: title, detail: detail, systemImage: systemImage, isSelected: false)
        }
        .buttonStyle(.plain)
    }

    private func rowLabel(title: String, detail: String, systemImage: String, isSelected: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.headline.weight(.bold))
                .foregroundStyle(isSelected ? BatonTheme.cream : BatonTheme.muted)
                .frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.callout.weight(.bold))
                    .foregroundStyle(BatonTheme.cream)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(BatonTheme.muted)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .background(isSelected ? BatonTheme.softFill(.planned) : LinearGradient(colors: [.clear, .clear], startPoint: .leading, endPoint: .trailing))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func sidebarMessage(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(BatonTheme.muted)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BatonTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func sidebarError(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(Color(batonHex: "#FB7185"))
            .lineLimit(3)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BatonTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func isSelected(_ project: Project) -> Bool {
        if case let .project(id) = navigation.section {
            return id == project.id
        }
        return false
    }

    private func agentLabel(_ agentId: String, leadAgentId: String?) -> String {
        if leadAgentId == agentId {
            return "\(AgentCatalog.displayName(for: agentId)) 👑"
        }
        return AgentCatalog.displayName(for: agentId)
    }
}
