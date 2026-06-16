import BatonKit
import SwiftUI

struct RunCard: View {
    let run: RunSummary
    let isSelected: Bool
    let onSelect: () -> Void
    let onApprove: (() -> Void)?
    let onReject: (() -> Void)?

    private let teamRoles = ["analyst", "architect", "implementer", "tester"]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(run.runId)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(BatonTheme.cream)
                        .lineLimit(1)
                    Text("워크플로우 \(run.workflowId)")
                        .font(.caption)
                        .foregroundStyle(BatonTheme.muted)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                StatusPill(status: run.status)
            }

            HStack(spacing: 8) {
                Label(progressText, systemImage: "checklist")
                Label(run.createdAt, systemImage: "clock")
                if run.dryRun {
                    Label("계획만", systemImage: "doc.text.magnifyingglass")
                }
            }
            .font(.caption)
            .foregroundStyle(BatonTheme.muted)
            .lineLimit(1)

            HStack(spacing: 6) {
                ForEach(teamRoles, id: \.self) { role in
                    RoleBadge(role: role)
                }
            }

            if run.status == .awaitingApproval {
                HStack(spacing: 8) {
                    Button {
                        onApprove?()
                    } label: {
                        Label("승인", systemImage: "checkmark.circle")
                    }
                    .buttonStyle(.borderless)

                    Button {
                        onReject?()
                    } label: {
                        Label("거부", systemImage: "xmark.circle")
                    }
                    .buttonStyle(.borderless)
                }
                .font(.caption.weight(.bold))
                .foregroundStyle(BatonTheme.cream)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(borderColor, lineWidth: isSelected ? 2 : 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .onTapGesture(perform: onSelect)
    }

    private var cardBackground: some ShapeStyle {
        if run.status == .awaitingApproval {
            return AnyShapeStyle(BatonTheme.softFill(.awaitingApproval))
        }
        if isSelected {
            return AnyShapeStyle(BatonTheme.surfaceElevated)
        }
        return AnyShapeStyle(BatonTheme.surface)
    }

    private var borderColor: Color {
        if isSelected {
            return Color(batonHex: StatusDisplay.tint(run.status).leadingHex).opacity(0.76)
        }
        if run.status == .awaitingApproval {
            return BatonTheme.amber.opacity(0.55)
        }
        return BatonTheme.separator
    }

    private var progressText: String {
        guard run.stepCount > 0 else {
            return "단계 0/0"
        }

        let completedSteps: Int
        switch run.status {
        case .planned:
            completedSteps = 0
        case .completed:
            completedSteps = run.stepCount
        case .running, .awaitingApproval, .failed, .cancelled:
            completedSteps = max(run.stepCount - 1, 0)
        }

        return "단계 \(completedSteps)/\(run.stepCount)"
    }
}
