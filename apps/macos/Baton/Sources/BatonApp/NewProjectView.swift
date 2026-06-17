import AppKit
import BatonKit
import SwiftUI

struct NewProjectView: View {
    let client: BatonClient
    let onCreated: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var form = ProjectFormModel()
    @State private var step: ProjectWizardStep = .name
    @State private var errorMessage: String?
    @State private var isSubmitting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            header
            stepTabs
            content

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Color(batonHex: "#FB7185"))
                    .lineLimit(3)
            }

            footer
        }
        .padding(26)
        .frame(width: 620)
        .background(BatonTheme.background)
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("새 프로젝트", systemImage: "paperclip")
                .font(.system(size: 30, weight: .heavy))
                .foregroundStyle(BatonTheme.cream)
            Text("프로젝트와 함께 사용할 AI 팀을 정합니다.")
                .font(.callout)
                .foregroundStyle(BatonTheme.muted)
        }
    }

    private var stepTabs: some View {
        HStack(spacing: 8) {
            ForEach(ProjectWizardStep.allCases, id: \.self) { item in
                Button {
                    step = item
                } label: {
                    Label(item.title, systemImage: item.systemImage)
                        .font(.callout.weight(.bold))
                        .foregroundStyle(step == item ? BatonTheme.cream : BatonTheme.muted)
                        .opacity(canOpen(item) ? 1 : 0.45)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(step == item ? BatonTheme.surfaceElevated : BatonTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(!canOpen(item))
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .name:
            nameStep
        case .source:
            sourceStep
        case .agents:
            agentsStep
        }
    }

    private var nameStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            fieldLabel("이름")
            TextField("Baton App", text: $form.name)
                .textFieldStyle(.plain)
                .font(.title3.weight(.semibold))
                .foregroundStyle(BatonTheme.cream)
                .padding(12)
                .background(BatonTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(BatonTheme.separator, lineWidth: 1)
                }
        }
    }

    private var sourceStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            fieldLabel("소스")

            Picker("소스", selection: $form.sourceKind) {
                Label("로컬", systemImage: "folder").tag(ProjectSourceKind.local)
                Label("GitHub", systemImage: "link").tag(ProjectSourceKind.github)
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            if form.sourceKind == .local {
                HStack(spacing: 10) {
                    TextField("/Users/me/app", text: $form.sourceValue)
                        .textFieldStyle(.plain)
                        .foregroundStyle(BatonTheme.cream)
                        .padding(11)
                        .background(BatonTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                    Button {
                        chooseFolder()
                    } label: {
                        Label("폴더 선택", systemImage: "folder.badge.plus")
                    }
                    .buttonStyle(.bordered)
                }
            } else {
                TextField("https://github.com/owner/repo", text: $form.sourceValue)
                    .textFieldStyle(.plain)
                    .foregroundStyle(BatonTheme.cream)
                    .padding(11)
                    .background(BatonTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                if !form.trimmedSourceValue.isEmpty && !form.isSourceValueValid {
                    Text("github.com URL을 입력하세요.")
                        .font(.caption)
                        .foregroundStyle(Color(batonHex: "#FB7185"))
                }
            }
        }
    }

    private var agentsStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            fieldLabel("AI 팀")

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(AgentCatalog.entries) { agent in
                    Toggle(isOn: agentBinding(agent.id)) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(agent.name)
                                .font(.headline.weight(.bold))
                                .foregroundStyle(BatonTheme.cream)
                            Text(agent.id)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(BatonTheme.muted)
                        }
                    }
                    .toggleStyle(.checkbox)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(BatonTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }

            if form.normalizedAgentIds.count > 1 {
                VStack(alignment: .leading, spacing: 8) {
                    fieldLabel("대표")
                    Picker("대표", selection: leadBinding) {
                        Text("선택").tag("")
                        ForEach(form.normalizedAgentIds, id: \.self) { agentId in
                            Text(AgentCatalog.displayName(for: agentId)).tag(agentId)
                        }
                    }
                    .pickerStyle(.radioGroup)
                    .labelsHidden()
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            Button("취소") {
                dismiss()
            }
            .buttonStyle(.plain)
            .foregroundStyle(BatonTheme.muted)

            Spacer()

            Button {
                step = step.previous ?? step
            } label: {
                Label("이전", systemImage: "chevron.left")
            }
            .disabled(step.previous == nil || isSubmitting)

            if let next = step.next {
                GradientButton(
                    title: "다음",
                    systemImage: "chevron.right",
                    isDisabled: !canContinue || isSubmitting,
                    action: {
                        step = next
                    }
                )
            } else {
                GradientButton(
                    title: isSubmitting ? "생성 중" : "생성",
                    systemImage: "paperclip",
                    isDisabled: !form.canSubmit || isSubmitting,
                    action: submit
                )
            }
        }
    }

    private var canContinue: Bool {
        switch step {
        case .name:
            !form.trimmedName.isEmpty
        case .source:
            !form.trimmedSourceValue.isEmpty && form.isSourceValueValid
        case .agents:
            form.canSubmit
        }
    }

    private func canOpen(_ item: ProjectWizardStep) -> Bool {
        switch item {
        case .name:
            true
        case .source:
            !form.trimmedName.isEmpty
        case .agents:
            !form.trimmedName.isEmpty && !form.trimmedSourceValue.isEmpty && form.isSourceValueValid
        }
    }

    private var leadBinding: Binding<String> {
        Binding(
            get: { form.normalizedLeadAgentId ?? "" },
            set: { value in
                form.leadAgentId = value.isEmpty ? nil : value
            }
        )
    }

    private func agentBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { form.normalizedAgentIds.contains(id) },
            set: { enabled in
                form.setAgent(id, enabled: enabled)
            }
        )
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.callout.weight(.bold))
            .foregroundStyle(BatonTheme.cream)
    }

    private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = false
        if panel.runModal() == .OK, let url = panel.url {
            form.sourceValue = url.path
        }
    }

    private func submit() {
        guard form.canSubmit else {
            return
        }

        isSubmitting = true
        errorMessage = nil

        Task {
            do {
                try await client.createProject(form)
                isSubmitting = false
                onCreated()
                dismiss()
            } catch {
                isSubmitting = false
                errorMessage = error.localizedDescription
            }
        }
    }
}

private enum ProjectWizardStep: CaseIterable {
    case name
    case source
    case agents

    var title: String {
        switch self {
        case .name:
            "이름"
        case .source:
            "소스"
        case .agents:
            "AI"
        }
    }

    var systemImage: String {
        switch self {
        case .name:
            "text.cursor"
        case .source:
            "folder"
        case .agents:
            "person.2"
        }
    }

    var previous: ProjectWizardStep? {
        switch self {
        case .name:
            nil
        case .source:
            .name
        case .agents:
            .source
        }
    }

    var next: ProjectWizardStep? {
        switch self {
        case .name:
            .source
        case .source:
            .agents
        case .agents:
            nil
        }
    }
}
