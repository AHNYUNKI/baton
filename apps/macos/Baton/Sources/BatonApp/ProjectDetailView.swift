import BatonKit
import SwiftUI

struct ProjectDetailView: View {
    let project: Project
    let client: BatonClient
    @Binding var selectedTab: AppNavigationModel.ProjectTab
    let onSaved: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            header
            tabPicker
            Rectangle()
                .fill(BatonTheme.separator)
                .frame(height: 1)
            tabContent
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Label(project.name, systemImage: "paperclip")
                        .font(.system(size: 34, weight: .heavy))
                        .foregroundStyle(BatonTheme.cream)
                        .lineLimit(2)

                    Text(sourceLabel)
                        .font(.callout)
                        .foregroundStyle(BatonTheme.muted)
                        .lineLimit(2)
                }

                Spacer()

                if let leadAgentId = project.leadAgentId {
                    Label("대표 \(AgentCatalog.displayName(for: leadAgentId))", systemImage: "crown.fill")
                        .font(.callout.weight(.bold))
                        .foregroundStyle(BatonTheme.cream)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(BatonTheme.surfaceElevated)
                        .clipShape(Capsule())
                }
            }

            HStack(spacing: 8) {
                ForEach(project.agentIds, id: \.self) { agentId in
                    agentPill(AgentCatalog.displayName(for: agentId))
                }
                agentPill(project.teamPlan == nil ? "TeamPlan 없음" : "역할 \(project.teamPlan?.roles.count ?? 0)")
            }
        }
        .padding(.horizontal, 30)
        .padding(.top, 28)
        .padding(.bottom, 18)
    }

    private var tabPicker: some View {
        Picker("프로젝트 탭", selection: $selectedTab) {
            Label("개요", systemImage: "doc.text").tag(AppNavigationModel.ProjectTab.overview)
            Label("계획", systemImage: "list.bullet.clipboard").tag(AppNavigationModel.ProjectTab.plan)
            Label("조직도", systemImage: "point.3.connected.trianglepath.dotted").tag(AppNavigationModel.ProjectTab.org)
            Label("실행", systemImage: "play.circle").tag(AppNavigationModel.ProjectTab.run)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .padding(.horizontal, 30)
        .padding(.bottom, 18)
        .frame(maxWidth: 640, alignment: .leading)
    }

    @ViewBuilder
    private var tabContent: some View {
        switch selectedTab {
        case .overview:
            overview
        case .plan:
            ProjectPlanView(project: project, client: client, onSaved: onSaved)
        case .org:
            OrgChartView(chart: OrgChartModel.buildOrgChart(project: project))
        case .run:
            runPlaceholder
        }
    }

    private var overview: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                section(title: "개요") {
                    Text(project.overview?.isEmpty == false ? project.overview ?? "" : "아직 프로젝트 개요가 없습니다. 계획 탭에서 개요를 입력하고 대표에게 역할 초안을 맡길 수 있습니다.")
                        .font(.body)
                        .foregroundStyle(project.overview?.isEmpty == false ? BatonTheme.cream : BatonTheme.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                section(title: "팀") {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(project.agentIds, id: \.self) { agentId in
                            HStack(spacing: 10) {
                                Image(systemName: project.leadAgentId == agentId ? "crown.fill" : "person.crop.circle")
                                    .foregroundStyle(project.leadAgentId == agentId ? BatonTheme.amber : BatonTheme.muted)
                                    .frame(width: 22)
                                Text(AgentCatalog.displayName(for: agentId))
                                    .font(.headline.weight(.bold))
                                    .foregroundStyle(BatonTheme.cream)
                                Spacer()
                                Text(project.leadAgentId == agentId ? "대표" : "담당")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(BatonTheme.muted)
                            }
                            .padding(12)
                            .background(BatonTheme.surfaceElevated)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                    }
                }
            }
            .padding(30)
            .frame(maxWidth: 920, alignment: .leading)
        }
    }

    private var runPlaceholder: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("실행", systemImage: "play.circle")
                .font(.system(size: 30, weight: .heavy))
                .foregroundStyle(BatonTheme.cream)
            Text("TeamPlan 실행 엔진은 v0.19 범위입니다.")
                .font(.title3)
                .foregroundStyle(BatonTheme.muted)
            Text("이 탭은 프로젝트 팀 구성이 실행 흐름으로 연결될 위치를 예약합니다. 현재 v0.18에서는 실행/디스패치 로직을 추가하지 않습니다.")
                .font(.body)
                .foregroundStyle(BatonTheme.cream)
                .frame(maxWidth: 620, alignment: .leading)
        }
        .padding(34)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
    }

    private var sourceLabel: String {
        switch project.source.kind {
        case .local:
            "로컬 · \(project.source.value)"
        case .github:
            "GitHub 참조 · \(project.source.value)"
        }
    }

    private func section<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline.weight(.heavy))
                .foregroundStyle(BatonTheme.cream)
            content()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }

    private func agentPill(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.bold))
            .foregroundStyle(BatonTheme.cream)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(BatonTheme.surfaceElevated)
            .clipShape(Capsule())
    }
}
