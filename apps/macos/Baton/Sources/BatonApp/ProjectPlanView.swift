import BatonKit
import SwiftUI

struct ProjectPlanView: View {
    let project: Project
    let client: BatonClient
    let onSaved: () -> Void

    @State private var overview: String
    @State private var editModel: TeamPlanEditModel
    @State private var errorMessage: String?
    @State private var statusMessage: String?
    @State private var isGenerating = false
    @State private var isSaving = false

    init(project: Project, client: BatonClient, onSaved: @escaping () -> Void = {}) {
        self.project = project
        self.client = client
        self.onSaved = onSaved
        _overview = State(initialValue: project.overview ?? "")
        _editModel = State(initialValue: TeamPlanEditModel(agentIds: project.agentIds, plan: project.teamPlan))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                overviewSection
                rolesSection
                footer
            }
            .padding(34)
            .frame(maxWidth: 920, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(project.name, systemImage: "paperclip")
                .font(.system(size: 34, weight: .heavy))
                .foregroundStyle(BatonTheme.cream)
                .lineLimit(2)

            HStack(spacing: 8) {
                if let leadAgentId = project.leadAgentId {
                    Label("대표 \(AgentCatalog.displayName(for: leadAgentId))", systemImage: "star.fill")
                        .font(.callout.weight(.bold))
                        .foregroundStyle(BatonTheme.cream)
                } else {
                    Label("대표 미설정", systemImage: "exclamationmark.triangle")
                        .font(.callout.weight(.bold))
                        .foregroundStyle(Color(batonHex: "#FBBF24"))
                }

                Text(project.agentIds.map { AgentCatalog.displayName(for: $0) }.joined(separator: " · "))
                    .font(.callout)
                    .foregroundStyle(BatonTheme.muted)
                    .lineLimit(1)
            }
        }
    }

    private var overviewSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            fieldLabel("개요")
            TextEditor(text: $overview)
                .font(.body)
                .foregroundStyle(BatonTheme.cream)
                .scrollContentBackground(.hidden)
                .frame(minHeight: 120)
                .padding(10)
                .background(BatonTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                        .stroke(BatonTheme.separator, lineWidth: 1)
                }

            if project.leadAgentId == nil, project.agentIds.count > 1 {
                Text("대표 AI가 설정되지 않아 생성할 수 없습니다.")
                    .font(.footnote)
                    .foregroundStyle(Color(batonHex: "#FBBF24"))
            }

            HStack {
                GradientButton(
                    title: isGenerating ? "생성 중" : "대표에게 맡기기",
                    systemImage: "sparkles",
                    isDisabled: overview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isGenerating || isSaving || (project.leadAgentId == nil && project.agentIds.count > 1),
                    action: generate
                )

                if isGenerating {
                    ProgressView()
                        .controlSize(.small)
                }
            }
        }
    }

    private var rolesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                fieldLabel("역할")
                Spacer()
                Button {
                    editModel.addRole()
                } label: {
                    Label("역할 추가", systemImage: "plus.circle")
                }
                .disabled(isGenerating || isSaving || project.agentIds.isEmpty)
            }

            if editModel.roles.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("아직 역할이 없습니다")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(BatonTheme.cream)
                    Text("개요를 입력하고 대표에게 초안을 맡기거나 직접 역할을 추가하세요.")
                        .font(.callout)
                        .foregroundStyle(BatonTheme.muted)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(BatonTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
            } else {
                ForEach($editModel.roles) { $role in
                    roleCard(role: $role)
                }
            }

            if let validationMessage = editModel.validationMessage {
                Text(validationMessage)
                    .font(.footnote)
                    .foregroundStyle(Color(batonHex: "#FB7185"))
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Color(batonHex: "#FB7185"))
                    .lineLimit(4)
            }
            if let statusMessage {
                Text(statusMessage)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color(batonHex: "#34D399"))
            }

            HStack {
                Spacer()
                GradientButton(
                    title: isSaving ? "저장 중" : "저장",
                    systemImage: "square.and.arrow.down",
                    isDisabled: !editModel.isValid || isGenerating || isSaving,
                    action: save
                )
                if isSaving {
                    ProgressView()
                        .controlSize(.small)
                }
            }
        }
    }

    private func roleCard(role: Binding<EditableTeamRole>) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("역할 이름", text: role.name)
                        .textFieldStyle(.plain)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(BatonTheme.cream)
                        .padding(10)
                        .background(BatonTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                    TextField("역할 설명", text: role.description)
                        .textFieldStyle(.plain)
                        .foregroundStyle(BatonTheme.cream)
                        .padding(10)
                        .background(BatonTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }

                Picker("담당 AI", selection: role.assignedAgentId) {
                    ForEach(project.agentIds, id: \.self) { agentId in
                        Text(AgentCatalog.displayName(for: agentId)).tag(agentId)
                    }
                }
                .frame(width: 160)

                Button {
                    editModel.removeRole(id: role.wrappedValue.id)
                } label: {
                    Label("삭제", systemImage: "trash")
                }
                .buttonStyle(.borderless)
            }

            VStack(alignment: .leading, spacing: 8) {
                fieldLabel("지침")
                TextEditor(text: role.instructions)
                    .font(.body)
                    .foregroundStyle(BatonTheme.cream)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 90)
                    .padding(8)
                    .background(BatonTheme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.callout.weight(.bold))
            .foregroundStyle(BatonTheme.cream)
    }

    private func generate() {
        let trimmed = overview.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return
        }

        isGenerating = true
        errorMessage = nil
        statusMessage = nil

        Task {
            do {
                let plan = try await client.generateTeamPlan(projectId: project.id, overview: trimmed)
                editModel = TeamPlanEditModel(agentIds: project.agentIds, plan: plan)
                statusMessage = "대표가 역할 초안을 만들고 저장했습니다."
                onSaved()
            } catch {
                errorMessage = error.localizedDescription
            }
            isGenerating = false
        }
    }

    private func save() {
        guard editModel.isValid else {
            return
        }

        isSaving = true
        errorMessage = nil
        statusMessage = nil

        Task {
            do {
                let plan = try editModel.toTeamPlan()
                let saved = try await client.setTeamPlan(projectId: project.id, plan: plan)
                editModel = TeamPlanEditModel(agentIds: project.agentIds, plan: saved)
                statusMessage = "TeamPlan을 저장했습니다."
                onSaved()
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        }
    }
}
