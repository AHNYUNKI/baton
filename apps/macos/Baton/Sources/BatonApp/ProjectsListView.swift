import BatonKit
import SwiftUI

struct ProjectsListView: View {
    let client: BatonClient
    let refreshKey: String
    let onNewProject: () -> Void

    @State private var projects: [Project] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            header

            ScrollView {
                LazyVStack(spacing: 12) {
                    if projects.isEmpty {
                        emptyState
                    } else {
                        ForEach(projects) { project in
                            ProjectCard(project: project)
                        }
                    }
                }
                .padding(.bottom, 12)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Color(batonHex: "#FB7185"))
                    .lineLimit(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(BatonTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(18)
        .frame(minWidth: BatonTheme.sidebarWidth, maxWidth: BatonTheme.sidebarWidth, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
        .navigationTitle("프로젝트")
        .toolbar {
            ToolbarItem {
                Button {
                    Task {
                        await load()
                    }
                } label: {
                    Label("새로고침", systemImage: "arrow.clockwise")
                }
                .disabled(isLoading)
            }
        }
        .task(id: refreshKey) {
            await load()
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("프로젝트")
                    .font(.system(size: 30, weight: .heavy))
                    .foregroundStyle(BatonTheme.cream)
                Text("\(projects.count)개 프로젝트")
                    .font(.callout)
                    .foregroundStyle(BatonTheme.muted)
            }
            Spacer()
            GradientButton(title: "새 프로젝트", systemImage: "paperclip", action: onNewProject)
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("프로젝트가 없습니다")
                .font(.headline.weight(.bold))
                .foregroundStyle(BatonTheme.cream)
            Text("새 프로젝트를 만들면 여기에 표시됩니다.")
                .font(.callout)
                .foregroundStyle(BatonTheme.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            projects = try await client.listProjects().sorted { left, right in
                if left.createdAt != right.createdAt {
                    return left.createdAt > right.createdAt
                }
                return left.name < right.name
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ProjectCard: View {
    let project: Project

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: project.source.kind == .local ? "folder" : "link")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(BatonTheme.cream)
                    .frame(width: 28, height: 28)

                VStack(alignment: .leading, spacing: 4) {
                    Text(project.name)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(BatonTheme.cream)
                        .lineLimit(2)
                    Text(sourceLabel)
                        .font(.caption)
                        .foregroundStyle(BatonTheme.muted)
                        .lineLimit(2)
                }
                Spacer()
            }

            HStack(spacing: 8) {
                if let leadAgentId = project.leadAgentId {
                    agentPill("대표 \(AgentCatalog.displayName(for: leadAgentId))", systemImage: "star.fill")
                }
                ForEach(project.agentIds, id: \.self) { agentId in
                    agentPill(AgentCatalog.displayName(for: agentId), systemImage: "person.crop.circle")
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }

    private var sourceLabel: String {
        switch project.source.kind {
        case .local:
            project.source.value
        case .github:
            "GitHub 참조 · \(project.source.value)"
        }
    }

    private func agentPill(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.caption.weight(.bold))
            .foregroundStyle(BatonTheme.cream)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(BatonTheme.surfaceElevated)
            .clipShape(Capsule())
    }
}
