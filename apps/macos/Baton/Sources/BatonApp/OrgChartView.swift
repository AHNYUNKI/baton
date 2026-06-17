import BatonKit
import SwiftUI

struct OrgChartView: View {
    let chart: OrgChart

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            VStack(alignment: .center, spacing: 28) {
                if chart.hasPlan {
                    OrgChartLeadCard(leadAgentId: chart.leadAgentId)
                    OrgChartForestView(roots: chart.roots)
                    OrgChartLegend()
                } else {
                    emptyState
                }
            }
            .padding(34)
            .frame(minWidth: canvasWidth, minHeight: 560, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(BatonTheme.background)
    }

    private var canvasWidth: CGFloat {
        max(980, CGFloat(max(leafCount(chart.roots), 1)) * (OrgChartNodeCard.width + 54))
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

    private func leafCount(_ roots: [OrgChartTreeNode]) -> Int {
        roots.reduce(0) { count, root in count + leafCount(root) }
    }

    private func leafCount(_ node: OrgChartTreeNode) -> Int {
        if node.children.isEmpty {
            return 1
        }
        return leafCount(node.children)
    }
}

private struct OrgChartLeadCard: View {
    let leadAgentId: String?

    var body: some View {
        VStack(alignment: .center, spacing: 10) {
            Text("👑")
                .font(.system(size: 30, weight: .bold))
            Text(leadTitle)
                .font(.title2.weight(.heavy))
                .foregroundStyle(BatonTheme.cream)
                .lineLimit(1)
            Text("대표 AI")
                .font(.caption.weight(.bold))
                .foregroundStyle(BatonTheme.muted)
            if let leadAgentId {
                OrgChartAgentBadge(agentId: leadAgentId)
            }
        }
        .padding(18)
        .frame(width: 280)
        .frame(minHeight: 142)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.accentGradient, lineWidth: 2)
        }
    }

    private var leadTitle: String {
        guard let leadAgentId else {
            return "대표 미설정"
        }
        return AgentCatalog.displayName(for: leadAgentId)
    }
}

private struct OrgChartForestView: View {
    let roots: [OrgChartTreeNode]

    var body: some View {
        if roots.isEmpty {
            Text("표시할 역할이 없습니다.")
                .font(.callout.weight(.bold))
                .foregroundStyle(BatonTheme.muted)
        } else {
            VStack(spacing: 0) {
                connector(height: 28)
                ZStack(alignment: .top) {
                    HStack(alignment: .top, spacing: 42) {
                        ForEach(roots) { root in
                            VStack(spacing: 0) {
                                connector(height: 28)
                                OrgChartTreeBranch(tree: root)
                            }
                        }
                    }
                    if roots.count > 1 {
                        connector(width: nil, height: 2)
                            .padding(.horizontal, OrgChartNodeCard.width / 2)
                    }
                }
            }
        }
    }

    private func connector(width: CGFloat? = 2, height: CGFloat) -> some View {
        Rectangle()
            .fill(BatonTheme.separator)
            .frame(width: width, height: height)
    }
}

private struct OrgChartTreeBranch: View {
    let tree: OrgChartTreeNode

    var body: some View {
        VStack(spacing: 0) {
            OrgChartNodeCard(node: tree.node, depth: tree.depth)

            if !tree.children.isEmpty {
                connector(height: 26)
                ZStack(alignment: .top) {
                    HStack(alignment: .top, spacing: 34) {
                        ForEach(tree.children) { child in
                            VStack(spacing: 0) {
                                connector(height: 26)
                                OrgChartTreeBranch(tree: child)
                            }
                        }
                    }
                    if tree.children.count > 1 {
                        connector(width: nil, height: 2)
                            .padding(.horizontal, OrgChartNodeCard.width / 2)
                    }
                }
            }
        }
    }

    private func connector(width: CGFloat? = 2, height: CGFloat) -> some View {
        Rectangle()
            .fill(BatonTheme.separator)
            .frame(width: width, height: height)
    }
}

private struct OrgChartNodeCard: View {
    static let width: CGFloat = 300

    let node: OrgChartNode
    let depth: Int

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                Circle()
                    .fill(BatonTheme.softFill(RoleDisplay.tint(role: node.roleId)))
                    .frame(width: 48, height: 48)
                Image(systemName: roleSymbol)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(BatonTheme.cream)
                Circle()
                    .fill(Color(batonHex: statusTint.leadingHex))
                    .frame(width: 13, height: 13)
                    .overlay {
                        Circle().stroke(BatonTheme.surface, lineWidth: 2)
                    }
                    .offset(x: 2, y: 2)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(node.name)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(BatonTheme.cream)
                        .lineLimit(2)
                    Spacer(minLength: 8)
                    Text("L\(depth + 1)")
                        .font(.caption2.weight(.heavy))
                        .foregroundStyle(BatonTheme.muted)
                }

                if !node.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(node.description)
                        .font(.caption)
                        .foregroundStyle(BatonTheme.muted)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 8) {
                    OrgChartAgentBadge(agentId: node.assignedAgentId)
                    OrgChartStatusBadge(status: node.status)
                }
            }
        }
        .padding(14)
        .frame(width: Self.width, alignment: .topLeading)
        .frame(minHeight: 122, alignment: .topLeading)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }

    private var roleSymbol: String {
        let roleId = node.roleId.lowercased()
        if roleId.contains("analyst") || roleId.contains("analysis") {
            return "magnifyingglass"
        }
        if roleId.contains("architect") || roleId.contains("design") {
            return "sparkles"
        }
        if roleId.contains("implement") || roleId.contains("build") {
            return "hammer"
        }
        if roleId.contains("test") {
            return "checklist"
        }
        if roleId.contains("review") {
            return "eye"
        }
        if roleId.contains("fix") {
            return "wrench.adjustable"
        }
        if roleId.contains("release") || roleId.contains("final") {
            return "paperplane"
        }
        return "paperclip"
    }

    private var statusTint: BatonDisplayTint {
        OrgChartPresentation.statusTint(node.status)
    }
}

private struct OrgChartAgentBadge: View {
    let agentId: String

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(Color(batonHex: tint.leadingHex))
                .frame(width: 8, height: 8)
            Text(AgentCatalog.displayName(for: agentId))
                .lineLimit(1)
        }
        .font(.caption.weight(.bold))
        .foregroundStyle(BatonTheme.cream)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(BatonTheme.softFill(tint))
        .clipShape(Capsule())
    }

    private var tint: BatonDisplayTint {
        OrgChartPresentation.agentTint(agentId)
    }
}

private struct OrgChartStatusBadge: View {
    let status: String

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(Color(batonHex: tint.leadingHex))
                .frame(width: 8, height: 8)
            Text(OrgChartPresentation.statusLabel(status))
                .lineLimit(1)
        }
        .font(.caption.weight(.heavy))
        .foregroundStyle(BatonTheme.cream)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(BatonTheme.softFill(tint))
        .clipShape(Capsule())
    }

    private var tint: BatonDisplayTint {
        OrgChartPresentation.statusTint(status)
    }
}

private struct OrgChartLegend: View {
    private let statuses = ["planned", "running", "awaiting-approval", "completed", "failed"]
    private let agents = ["claude", "codex"]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("범례")
                .font(.caption.weight(.heavy))
                .foregroundStyle(BatonTheme.muted)
            HStack(alignment: .center, spacing: 12) {
                ForEach(statuses, id: \.self) { status in
                    OrgChartStatusBadge(status: status)
                }
                Divider()
                    .frame(height: 20)
                    .overlay(BatonTheme.separator)
                ForEach(agents, id: \.self) { agentId in
                    OrgChartAgentBadge(agentId: agentId)
                }
            }
        }
        .padding(.top, 6)
    }
}

private enum OrgChartPresentation {
    static func statusLabel(_ status: String) -> String {
        switch status {
        case "planned":
            "대기"
        case "running":
            "실행 중"
        case "awaiting-approval":
            "승인 대기"
        case "completed":
            "완료"
        case "failed":
            "실패"
        case "cancelled":
            "취소됨"
        default:
            status
        }
    }

    static func statusTint(_ status: String) -> BatonDisplayTint {
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

    static func agentTint(_ agentId: String) -> BatonDisplayTint {
        switch agentId {
        case "claude":
            BatonDisplayTint(name: "claude", leadingHex: "#8B5CF6", trailingHex: "#EC4899")
        case "codex":
            BatonDisplayTint(name: "codex", leadingHex: "#F97316", trailingHex: "#F59E0B")
        default:
            .muted
        }
    }
}
