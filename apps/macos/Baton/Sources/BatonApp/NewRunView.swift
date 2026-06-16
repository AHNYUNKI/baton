import BatonKit
import SwiftUI

struct NewRunView: View {
    @ObservedObject var store: RunsStore
    @Environment(\.dismiss) private var dismiss
    @State private var form = NewRunFormModel()
    @State private var errorMessage: String?
    @State private var isSubmitting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            header

            VStack(alignment: .leading, spacing: 10) {
                Text("요청")
                    .font(.callout.weight(.bold))
                    .foregroundStyle(BatonTheme.cream)
                TextEditor(text: $form.request)
                    .font(.body)
                    .foregroundStyle(BatonTheme.cream)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 140)
                    .padding(10)
                    .background(BatonTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(BatonTheme.separator, lineWidth: 1)
                    }
            }

            workerSection
            advancedSection

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Color(batonHex: "#FB7185"))
                    .lineLimit(3)
            }

            HStack {
                Button("취소") {
                    dismiss()
                }
                .buttonStyle(.plain)
                .foregroundStyle(BatonTheme.muted)

                Spacer()

                GradientButton(
                    title: isSubmitting ? "시작 중" : "시작",
                    systemImage: "play.fill",
                    isDisabled: !form.canSubmit || isSubmitting,
                    action: submit
                )
            }
        }
        .padding(26)
        .frame(width: 640)
        .background(BatonTheme.background)
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("새 실행")
                .font(.system(size: 30, weight: .heavy))
                .foregroundStyle(BatonTheme.cream)
            Text("요청을 적고 Baton 팀에 맡길 역할을 선택합니다.")
                .font(.callout)
                .foregroundStyle(BatonTheme.muted)
        }
    }

    private var workerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("팀(역할)")
                .font(.callout.weight(.bold))
                .foregroundStyle(BatonTheme.cream)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                workerPicker(title: "구현", subtitle: "Codex", role: "implementer", selection: $form.useCodex)
                workerPicker(title: "분석·설계·리뷰", subtitle: "Claude", role: "architect", selection: $form.useClaude)
                workerPicker(title: "테스트", subtitle: "test", role: "tester", selection: $form.useTest)
                workerPicker(title: "자동 수정", subtitle: "fix", role: "fixer", selection: $form.fixEnabled)
            }
        }
    }

    private var advancedSection: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 12) {
                Toggle("계획만(미실행)", isOn: $form.dryRun)
                    .toggleStyle(.checkbox)

                VStack(alignment: .leading, spacing: 6) {
                    Text("테스트 명령")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(BatonTheme.muted)
                    TextField("pnpm test", text: $form.testCommand)
                        .textFieldStyle(.plain)
                        .padding(9)
                        .background(BatonTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("최대 수정 횟수")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(BatonTheme.muted)
                    TextField("예: 2", text: $form.maxFixAttemptsText)
                        .textFieldStyle(.plain)
                        .padding(9)
                        .background(BatonTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    if !form.isMaxFixAttemptsValid {
                        Text("0 이상의 정수를 입력하거나 비워 두세요.")
                            .font(.caption)
                            .foregroundStyle(Color(batonHex: "#FB7185"))
                    }
                }
            }
            .padding(.top, 10)
        } label: {
            Text("고급 옵션")
                .font(.callout.weight(.bold))
                .foregroundStyle(BatonTheme.cream)
        }
        .tint(BatonTheme.cream)
    }

    private func workerPicker(
        title: String,
        subtitle: String,
        role: String,
        selection: Binding<Bool?>
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                RoleBadge(role: role)
                Spacer()
                Text(subtitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(BatonTheme.muted)
            }

            Text(title)
                .font(.callout.weight(.bold))
                .foregroundStyle(BatonTheme.cream)

            Picker(title, selection: selection) {
                Text("자동").tag(Bool?.none)
                Text("사용").tag(Bool?.some(true))
                Text("끄기").tag(Bool?.some(false))
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
        .padding(12)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }

    private func submit() {
        guard form.canSubmit else {
            return
        }

        isSubmitting = true
        errorMessage = nil
        let request = form.trimmedRequest
        let options = form.buildOptions()

        Task {
            do {
                try await store.startRun(request: request, options: options)
                isSubmitting = false
                dismiss()
            } catch {
                isSubmitting = false
                errorMessage = error.localizedDescription
            }
        }
    }
}
