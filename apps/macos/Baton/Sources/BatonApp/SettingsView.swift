import BatonKit
import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var draftPreference: String
    let onSave: (String) -> Void

    init(preference: String, onSave: @escaping (String) -> Void) {
        self._draftPreference = State(initialValue: preference)
        self.onSave = onSave
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text("설정")
                    .font(.system(size: 28, weight: .heavy))
                    .foregroundStyle(BatonTheme.cream)
                Text("Baton CLI 실행 파일 경로를 지정합니다.")
                    .font(.callout)
                    .foregroundStyle(BatonTheme.muted)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("baton 실행 파일 경로")
                    .font(.callout.weight(.bold))
                    .foregroundStyle(BatonTheme.cream)
                TextField("baton", text: $draftPreference)
                    .textFieldStyle(.plain)
                    .padding(10)
                    .background(BatonTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(BatonTheme.separator, lineWidth: 1)
                    }

                Text("현재 해석: \(BatonLocation.resolve(preference: draftPreference))")
                    .font(.caption)
                    .foregroundStyle(BatonTheme.muted)
                    .textSelection(.enabled)
            }

            HStack {
                Button("PATH 기본값 사용") {
                    draftPreference = ""
                }
                .buttonStyle(.plain)
                .foregroundStyle(BatonTheme.muted)

                Spacer()

                Button("취소") {
                    dismiss()
                }
                .buttonStyle(.plain)
                .foregroundStyle(BatonTheme.muted)

                GradientButton(title: "저장", systemImage: "checkmark") {
                    onSave(draftPreference)
                    dismiss()
                }
            }
        }
        .padding(26)
        .frame(width: 520)
        .background(BatonTheme.background)
        .preferredColorScheme(.dark)
    }
}
