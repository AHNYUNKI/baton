import SwiftUI

struct GradientButton: View {
    let title: String
    let systemImage: String
    var isDisabled = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.callout.weight(.bold))
                .foregroundStyle(BatonTheme.cream)
                .lineLimit(1)
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .frame(minHeight: 34)
                .background(isDisabled ? AnyShapeStyle(BatonTheme.surfaceElevated) : AnyShapeStyle(BatonTheme.accentGradient))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
        .opacity(isDisabled ? 0.55 : 1)
    }
}
