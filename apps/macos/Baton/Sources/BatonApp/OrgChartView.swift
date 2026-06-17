import BatonKit
import SwiftUI

struct OrgChartView: View {
    let chart: OrgChart

    var body: some View {
        ScrollView {
            VStack(alignment: .center, spacing: 22) {
                if chart.hasPlan {
                    leadNode
                    connector
                    roleGrid
                } else {
                    emptyState
                }
            }
            .padding(34)
            .frame(maxWidth: 980, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(BatonTheme.background)
    }

    private var leadNode: some View {
        VStack(alignment: .center, spacing: 10) {
            Image(systemName: "crown.fill")
                .font(.title2.weight(.bold))
                .foregroundStyle(BatonTheme.amber)
            Text(leadTitle)
                .font(.title2.weight(.heavy))
                .foregroundStyle(BatonTheme.cream)
            Text("대표 AI")
                .font(.caption.weight(.bold))
                .foregroundStyle(BatonTheme.muted)
        }
        .padding(18)
        .frame(width: 260)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.amber.opacity(0.7), lineWidth: 1)
        }
    }

    private var connector: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(BatonTheme.separator)
                .frame(width: 2, height: 28)
            HStack(spacing: 0) {
                Rectangle()
                    .fill(BatonTheme.separator)
                    .frame(height: 2)
            }
            .frame(width: min(CGFloat(max(chart.nodes.count, 1)) * 150, 720))
        }
    }

    private var roleGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 14)], spacing: 14) {
            ForEach(chart.nodes) { node in
                roleNode(node)
            }
        }
        .frame(maxWidth: 840)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("조직도가 아직 없습니다", systemImage: "point.3.connected.trianglepath.dotted")
                .font(.system(size: 30, weight: .heavy))
                .foregroundStyle(BatonTheme.cream)
            Text("계획 탭에서 TeamPlan을 만들면 대표 AI와 역할별 담당 AI가 이곳에 표시됩니다.")
                .font(.title3)
                .foregroundStyle(BatonTheme.muted)
            if let leadAgentId = chart.leadAgentId {
                Text("현재 대표: \(AgentCatalog.displayName(for: leadAgentId))")
                    .font(.callout.weight(.bold))
                    .foregroundStyle(BatonTheme.cream)
            }
        }
        .padding(20)
        .frame(maxWidth: 640, alignment: .leading)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }

    private func roleNode(_ node: OrgChartNode) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "paperclip")
                    .foregroundStyle(BatonTheme.amber)
                VStack(alignment: .leading, spacing: 4) {
                    Text(node.name)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(BatonTheme.cream)
                        .lineLimit(2)
                    Text(node.roleId)
                        .font(.caption.monospaced())
                        .foregroundStyle(BatonTheme.muted)
                        .lineLimit(1)
                }
                Spacer()
            }

            agentPill(agentId: node.assignedAgentId)
            statusCapsule(status: node.status)
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 154, alignment: .topLeading)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }

    private var leadTitle: String {
        guard let leadAgentId = chart.leadAgentId else {
            return "대표 미설정"
        }
        return "\(AgentCatalog.displayName(for: leadAgentId)) 👑"
    }

    private func agentPill(agentId: String) -> some View {
        Label(AgentCatalog.displayName(for: agentId), systemImage: "person.crop.circle")
            .font(.caption.weight(.bold))
            .foregroundStyle(BatonTheme.cream)
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(BatonTheme.surfaceElevated)
            .clipShape(Capsule())
    }

    private func statusCapsule(status: String) -> some View {
        Text(statusLabel(status))
            .font(.caption.weight(.heavy))
            .foregroundStyle(BatonTheme.cream)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(BatonTheme.softFill(tint(for: status)))
            .clipShape(Capsule())
    }

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "planned":
            "상태: 계획됨"
        case "running":
            "상태: 진행 중"
        case "awaiting-approval":
            "상태: 승인 대기"
        case "completed":
            "상태: 완료"
        case "failed":
            "상태: 실패"
        case "cancelled":
            "상태: 취소됨"
        default:
            "상태: \(status)"
        }
    }

    private func tint(for status: String) -> BatonDisplayTint {
        switch status {
        case "running":
            .running
        case "awaiting-approval":
            .awaitingApproval
        case "completed":
            .completed
        case "failed":
            .failed
        case "cancelled":
            .muted
        default:
            .planned
        }
    }
}
