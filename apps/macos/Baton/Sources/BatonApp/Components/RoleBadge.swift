import BatonKit
import SwiftUI

struct RoleBadge: View {
    let label: String
    let tint: BatonDisplayTint

    init(role: String) {
        self.label = RoleDisplay.koreanLabel(role: role)
        self.tint = RoleDisplay.tint(role: role)
    }

    init(stepType: WorkflowStepType) {
        self.label = RoleDisplay.koreanLabel(stepType: stepType)
        self.tint = RoleDisplay.tint(stepType: stepType)
    }

    var body: some View {
        Text(label)
            .font(.caption2.weight(.bold))
            .foregroundStyle(BatonTheme.cream)
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(BatonTheme.softFill(tint))
            .overlay {
                Capsule()
                    .stroke(Color(batonHex: tint.leadingHex).opacity(0.42), lineWidth: 1)
            }
            .clipShape(Capsule())
            .accessibilityLabel(Text(label))
    }
}
