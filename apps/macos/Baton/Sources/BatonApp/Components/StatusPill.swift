import BatonKit
import SwiftUI

struct StatusPill: View {
    let label: String
    let tint: BatonDisplayTint

    init(status: RunStatus) {
        self.label = StatusDisplay.koreanLabel(status)
        self.tint = StatusDisplay.tint(status)
    }

    init(status: RunStepStatus) {
        self.label = StatusDisplay.koreanLabel(status)
        self.tint = StatusDisplay.tint(status)
    }

    init(status: ApprovalStatus) {
        self.label = StatusDisplay.koreanLabel(status)
        self.tint = StatusDisplay.tint(status)
    }

    var body: some View {
        Text(label)
            .font(.caption.weight(.bold))
            .foregroundStyle(BatonTheme.cream)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(BatonTheme.gradient(tint))
            .clipShape(Capsule())
            .accessibilityLabel(Text(label))
    }
}
