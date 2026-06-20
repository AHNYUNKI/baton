import BatonKit
import SwiftUI

struct ExecutionView: View {
    let project: Project
    let client: BatonClient
    @Binding var monitor: TeamRunMonitorModel
    let isLoading: Bool
    let monitorErrorMessage: String?
    let watchMessage: String?
    let onRefresh: () async -> Void

    @State private var useCodex = false
    @State private var useClaude = false
    @State private var useWrite = false
    @State private var baseBranch = ""
    @State private var timeoutMs = ""
    @State private var approvalNote = ""
    @State private var reviewNote = ""
    @State private var checkpointNote = ""
    @State private var actionMessage: String?
    @State private var actionErrorMessage: String?
    @State private var isStarting = false
    @State private var isActing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                startSection
                selectionSection

                if let current = monitor.current {
                    currentSection(current)
                    rolesSection(current)
                    gateSection(current)
                    usageSection(current)
                    eventSection(current)
                } else {
                    emptyState
                }
            }
            .padding(34)
            .frame(maxWidth: 1080, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Label("실행 모니터", systemImage: "paperclip")
                    .font(.system(size: 34, weight: .heavy))
                    .foregroundStyle(BatonTheme.cream)
                Text(project.name)
                    .font(.callout.weight(.bold))
                    .foregroundStyle(BatonTheme.muted)
            }

            Spacer()

            Button {
                Task { @MainActor in
                    await onRefresh()
                }
            } label: {
                Label(isLoading ? "갱신 중" : "새로고침", systemImage: "arrow.clockwise")
            }
            .disabled(isLoading)
        }
    }

    private var startSection: some View {
        section(title: "시작") {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 16) {
                    Toggle("Codex", isOn: $useCodex)
                        .toggleStyle(.checkbox)
                    Toggle("Claude", isOn: $useClaude)
                        .toggleStyle(.checkbox)
                    Toggle("쓰기", isOn: $useWrite)
                        .toggleStyle(.checkbox)
                }
                .foregroundStyle(BatonTheme.cream)

                HStack(spacing: 12) {
                    TextField("base branch", text: $baseBranch)
                        .textFieldStyle(.plain)
                        .padding(9)
                        .frame(width: 180)
                        .background(BatonTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                    TextField("timeout ms", text: $timeoutMs)
                        .textFieldStyle(.plain)
                        .padding(9)
                        .frame(width: 130)
                        .background(BatonTheme.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                    GradientButton(
                        title: isStarting ? "시작 중" : "시작",
                        systemImage: "play.fill",
                        isDisabled: isStarting || isActing,
                        action: startTeamRun
                    )
                }

                if !useCodex, !useClaude, !useWrite {
                    Text("기본 stub 모드")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(BatonTheme.muted)
                }
            }
        }
    }

    private var selectionSection: some View {
        section(title: "TeamRun") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Picker("TeamRun", selection: selectedRunBinding) {
                        if monitor.summaries.isEmpty {
                            Text("없음").tag("")
                        } else {
                            ForEach(monitor.summaries) { summary in
                                Text(summaryTitle(summary)).tag(summary.teamRunId)
                            }
                        }
                    }
                    .labelsHidden()
                    .frame(width: 360)
                    .disabled(monitor.summaries.isEmpty || isLoading || isActing)

                    if isLoading {
                        ProgressView()
                            .controlSize(.small)
                    }

                    Spacer()

                    if let selected = monitor.selected {
                        TeamRunStatusBadge(status: selected.status)
                    }
                }

                if let monitorErrorMessage {
                    message(monitorErrorMessage, isError: true)
                }
                if let actionErrorMessage {
                    message(actionErrorMessage, isError: true)
                }
                if let actionMessage {
                    message(actionMessage, isError: false)
                }
            }
        }
    }

    private func currentSection(_ teamRun: TeamRun) -> some View {
        section(title: "현재 상태") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    TeamRunStatusBadge(status: teamRun.status)
                    Text(teamRun.id)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(BatonTheme.cream)
                    Spacer()
                    Text("생성 \(teamRun.createdAt)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(BatonTheme.muted)
                }

                if let updatedAt = teamRun.updatedAt {
                    infoRow("업데이트", updatedAt)
                }
                if let baseBranch = teamRun.baseBranch {
                    infoRow("Base", baseBranch)
                }
                if let worktreePath = teamRun.worktreePath {
                    infoRow("Worktree", worktreePath)
                }
                if let diffSummary = teamRun.diffSummary, !diffSummary.isEmpty {
                    infoRow("Diff", diffSummary)
                }
            }
        }
    }

    private func rolesSection(_ teamRun: TeamRun) -> some View {
        section(title: "역할") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(orderedRoles(teamRun)) { role in
                    TeamRunRoleRow(role: role, isCheckpoint: role.roleId == monitor.checkpointRoleId)
                }
            }
        }
    }

    private func gateSection(_ teamRun: TeamRun) -> some View {
        section(title: "게이트") {
            VStack(alignment: .leading, spacing: 14) {
                if monitor.canApprove {
                    noteField("승인 메모", text: $approvalNote)
                    HStack(spacing: 10) {
                        actionButton("승인", systemImage: "checkmark.circle.fill", disabled: isActing) {
                            approveTeamRun(reject: false)
                        }
                        actionButton("거부", systemImage: "xmark.circle.fill", disabled: isActing) {
                            approveTeamRun(reject: true)
                        }
                    }
                } else if monitor.canReview {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(teamRun.diffSummary?.isEmpty == false ? teamRun.diffSummary ?? "" : "diff 요약이 없습니다.")
                            .font(.body)
                            .foregroundStyle(BatonTheme.cream)
                        infoRow("diff.patch", ".baton/runs/\(teamRun.id)/diff.patch")
                    }
                    noteField("검토 메모", text: $reviewNote)
                    HStack(spacing: 10) {
                        actionButton("Accept", systemImage: "checkmark.seal.fill", disabled: isActing) {
                            reviewTeamRun(accept: true)
                        }
                        actionButton("Reject", systemImage: "xmark.seal.fill", disabled: isActing) {
                            reviewTeamRun(accept: false)
                        }
                    }
                } else if monitor.canContinueCheckpoint {
                    VStack(alignment: .leading, spacing: 10) {
                        if let role = checkpointRole(in: teamRun) {
                            Label("체크포인트 역할", systemImage: "paperclip")
                                .font(.caption.weight(.heavy))
                                .foregroundStyle(BatonTheme.amber)
                            Text(role.name)
                                .font(.headline.weight(.heavy))
                                .foregroundStyle(BatonTheme.cream)
                            if let explanation = nonEmpty(role.explanation) {
                                Text(explanation)
                                    .font(.callout)
                                    .foregroundStyle(BatonTheme.cream)
                                    .lineLimit(5)
                            }
                        } else {
                            Text("체크포인트 검토가 필요합니다.")
                                .font(.callout.weight(.bold))
                                .foregroundStyle(BatonTheme.cream)
                        }
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(BatonTheme.softFill(.awaitingApproval))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                    noteField("체크포인트 메모", text: $checkpointNote)
                    HStack(spacing: 10) {
                        actionButton("계속", systemImage: "arrow.forward.circle.fill", disabled: isActing) {
                            continueCheckpoint(reject: false)
                        }
                        actionButton("거부", systemImage: "xmark.circle.fill", disabled: isActing) {
                            continueCheckpoint(reject: true)
                        }
                    }
                } else {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark.shield")
                            .foregroundStyle(Color(batonHex: "#34D399"))
                        Text("현재 필요한 승인 또는 diff 검토가 없습니다.")
                            .font(.callout.weight(.bold))
                            .foregroundStyle(BatonTheme.muted)
                    }
                }
            }
        }
    }

    private func usageSection(_ teamRun: TeamRun) -> some View {
        section(title: "토큰") {
            let roles = orderedRoles(teamRun).filter { $0.usage != nil }
            if roles.isEmpty {
                Text("토큰 사용량이 아직 없습니다.")
                    .font(.callout.weight(.bold))
                    .foregroundStyle(BatonTheme.muted)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(roles) { role in
                        if let usage = role.usage {
                            HStack(spacing: 12) {
                                Text(role.name)
                                    .font(.callout.weight(.bold))
                                    .foregroundStyle(BatonTheme.cream)
                                    .frame(width: 180, alignment: .leading)
                                Text("입력 \(usage.inputTokens)")
                                Text("출력 \(usage.outputTokens)")
                                Text("합계 \(usage.inputTokens + usage.outputTokens)")
                                if usage.estimated {
                                    Text("추정")
                                        .font(.caption.weight(.heavy))
                                        .foregroundStyle(BatonTheme.amber)
                                }
                            }
                            .font(.caption)
                            .foregroundStyle(BatonTheme.muted)
                        }
                    }

                    Divider()
                        .overlay(BatonTheme.separator)

                    HStack(spacing: 12) {
                        Text("총합")
                            .font(.callout.weight(.heavy))
                            .foregroundStyle(BatonTheme.cream)
                            .frame(width: 180, alignment: .leading)
                        Text("입력 \(totalInputTokens(teamRun))")
                        Text("출력 \(totalOutputTokens(teamRun))")
                        Text("합계 \(totalInputTokens(teamRun) + totalOutputTokens(teamRun))")
                    }
                    .font(.caption.weight(.bold))
                    .foregroundStyle(BatonTheme.cream)
                }
            }
        }
    }

    private func eventSection(_ teamRun: TeamRun) -> some View {
        section(title: "이벤트") {
            VStack(alignment: .leading, spacing: 10) {
                infoRow("Watch", watchMessage ?? "대기 중")
                infoRow("현재 선택", teamRun.id)
                if let worktreePath = teamRun.worktreePath {
                    infoRow("첨부", worktreePath)
                }
            }
        }
    }

    private var emptyState: some View {
        section(title: "상태") {
            VStack(alignment: .leading, spacing: 8) {
                Text("표시할 TeamRun이 없습니다.")
                    .font(.headline.weight(.heavy))
                    .foregroundStyle(BatonTheme.cream)
                Text("시작 버튼으로 새 실행을 만들거나 새로고침으로 기존 실행을 불러오세요.")
                    .font(.callout)
                    .foregroundStyle(BatonTheme.muted)
            }
        }
    }

    private var selectedRunBinding: Binding<String> {
        Binding(
            get: {
                monitor.selected?.teamRunId ?? ""
            },
            set: { newValue in
                guard !newValue.isEmpty else {
                    monitor.select(id: nil)
                    return
                }
                monitor.select(id: newValue)
                Task { @MainActor in
                    await loadSelectedTeamRun(id: newValue)
                }
            }
        )
    }

    private func summaryTitle(_ summary: TeamRunSummary) -> String {
        var parts = [summary.teamRunId, teamRunStatusLabel(summary.status)]
        if let roleCount = summary.roleCount {
            let completed = summary.completedRoleCount ?? 0
            parts.append("\(completed)/\(roleCount)")
        }
        return parts.joined(separator: " · ")
    }

    private func orderedRoles(_ teamRun: TeamRun) -> [TeamRunRole] {
        let rank = Dictionary(uniqueKeysWithValues: teamRun.order.enumerated().map { ($0.element, $0.offset) })
        return teamRun.roles.sorted { left, right in
            let leftRank = rank[left.roleId] ?? Int.max
            let rightRank = rank[right.roleId] ?? Int.max
            if leftRank != rightRank {
                return leftRank < rightRank
            }
            return left.roleId < right.roleId
        }
    }

    private func checkpointRole(in teamRun: TeamRun) -> TeamRunRole? {
        guard let checkpointRoleId = monitor.checkpointRoleId else {
            return nil
        }
        return teamRun.roles.first { $0.roleId == checkpointRoleId }
    }

    private func totalInputTokens(_ teamRun: TeamRun) -> Int {
        teamRun.roles.reduce(0) { total, role in total + (role.usage?.inputTokens ?? 0) }
    }

    private func totalOutputTokens(_ teamRun: TeamRun) -> Int {
        teamRun.roles.reduce(0) { total, role in total + (role.usage?.outputTokens ?? 0) }
    }

    private func startTeamRun() {
        guard let timeout = parsedTimeoutMs else {
            actionErrorMessage = "timeout ms는 1 이상의 정수로 입력하거나 비워 두세요."
            return
        }

        isStarting = true
        actionMessage = nil
        actionErrorMessage = nil
        let options = StartTeamRunOptions(
            codex: useCodex,
            claude: useClaude,
            write: useWrite,
            baseBranch: emptyToNil(baseBranch),
            timeoutMs: timeout
        )

        Task { @MainActor in
            do {
                let teamRun = try await client.startTeamRun(projectId: project.id, options: options)
                monitor.setCurrent(teamRun)
                actionMessage = "TeamRun을 시작했습니다."
                await onRefresh()
            } catch {
                actionErrorMessage = error.localizedDescription
            }
            isStarting = false
        }
    }

    private func approveTeamRun(reject: Bool) {
        guard let teamRunId = monitor.current?.id else {
            return
        }

        isActing = true
        actionMessage = nil
        actionErrorMessage = nil
        let note = emptyToNil(approvalNote)

        Task { @MainActor in
            do {
                let updated = try await client.approveTeamRun(teamRunId: teamRunId, reject: reject, note: note)
                monitor.setCurrent(updated)
                actionMessage = reject ? "TeamRun을 거부했습니다." : "TeamRun을 승인했습니다."
                await onRefresh()
            } catch {
                actionErrorMessage = error.localizedDescription
            }
            isActing = false
        }
    }

    private func reviewTeamRun(accept: Bool) {
        guard let teamRunId = monitor.current?.id else {
            return
        }

        isActing = true
        actionMessage = nil
        actionErrorMessage = nil
        let note = emptyToNil(reviewNote)

        Task { @MainActor in
            do {
                let updated = try await client.reviewTeamRun(teamRunId: teamRunId, accept: accept, note: note)
                monitor.setCurrent(updated)
                actionMessage = accept ? "diff 검토를 승인했습니다." : "diff 검토를 거부했습니다."
                await onRefresh()
            } catch {
                actionErrorMessage = error.localizedDescription
            }
            isActing = false
        }
    }

    private func continueCheckpoint(reject: Bool) {
        guard let teamRunId = monitor.current?.id else {
            return
        }

        isActing = true
        actionMessage = nil
        actionErrorMessage = nil
        let note = emptyToNil(checkpointNote)

        Task { @MainActor in
            do {
                let updated = try await client.continueCheckpoint(teamRunId: teamRunId, reject: reject, note: note)
                monitor.setCurrent(updated)
                actionMessage = reject ? "체크포인트를 거부했습니다." : "체크포인트를 계속 진행했습니다."
                await onRefresh()
            } catch {
                actionErrorMessage = error.localizedDescription
            }
            isActing = false
        }
    }

    @MainActor
    private func loadSelectedTeamRun(id: String) async {
        isActing = true
        actionMessage = nil
        actionErrorMessage = nil
        do {
            let teamRun = try await client.showTeamRun(teamRunId: id)
            monitor.setCurrent(teamRun)
        } catch {
            actionErrorMessage = error.localizedDescription
        }
        isActing = false
    }

    private var parsedTimeoutMs: Int?? {
        let trimmed = timeoutMs.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return .some(nil)
        }
        guard let value = Int(trimmed), value > 0 else {
            return nil
        }
        return .some(value)
    }

    private func emptyToNil(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func nonEmpty(_ value: String?) -> String? {
        guard let value else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func noteField(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text)
            .textFieldStyle(.plain)
            .padding(9)
            .background(BatonTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func actionButton(_ title: String, systemImage: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
        }
        .disabled(disabled)
    }

    private func infoRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(label)
                .font(.caption.weight(.heavy))
                .foregroundStyle(BatonTheme.muted)
                .frame(width: 90, alignment: .leading)
            Text(value)
                .font(.caption)
                .foregroundStyle(BatonTheme.cream)
                .textSelection(.enabled)
                .lineLimit(2)
        }
    }

    private func message(_ text: String, isError: Bool) -> some View {
        Text(text)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(isError ? Color(batonHex: "#FB7185") : Color(batonHex: "#34D399"))
            .lineLimit(4)
    }

    private func section<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline.weight(.heavy))
                .foregroundStyle(BatonTheme.cream)
            content()
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }
}

private struct TeamRunRoleRow: View {
    let role: TeamRunRole
    let isCheckpoint: Bool

    @State private var isExplanationExpanded = true

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                RoleBadge(role: role.roleId)
                VStack(alignment: .leading, spacing: 3) {
                    Text(role.name)
                        .font(.headline.weight(.heavy))
                        .foregroundStyle(BatonTheme.cream)
                    Text(role.roleId)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(BatonTheme.muted)
                }
                Spacer()
                TeamRunStatusBadge(status: role.status)
                Text(AgentCatalog.displayName(for: role.assignedAgentId))
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(BatonTheme.cream)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
                    .background(BatonTheme.softFill(RoleDisplay.tint(role: role.roleId)))
                    .clipShape(Capsule())
            }

            if isCheckpoint {
                Label("현재 체크포인트", systemImage: "paperclip")
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(BatonTheme.amber)
            }
            if let summary = role.summary, !summary.isEmpty {
                Text(summary)
                    .font(.callout)
                    .foregroundStyle(BatonTheme.cream)
                    .lineLimit(3)
            }
            if let explanation = trimmedExplanation {
                DisclosureGroup(isExpanded: $isExplanationExpanded) {
                    Text(explanation)
                        .font(.callout)
                        .foregroundStyle(BatonTheme.cream)
                        .lineLimit(isExplanationExpanded ? nil : 3)
                        .padding(.top, 4)
                } label: {
                    Label("왜", systemImage: "questionmark.circle")
                        .font(.caption.weight(.heavy))
                        .foregroundStyle(BatonTheme.amber)
                }
                .tint(BatonTheme.amber)
                .padding(10)
                .background(BatonTheme.softFill(.awaitingApproval))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            if let reason = role.reason, !reason.isEmpty {
                Text(reason)
                    .font(.caption)
                    .foregroundStyle(Color(batonHex: "#FB7185"))
                    .lineLimit(2)
            }
            if let usage = role.usage {
                Text("토큰 입력 \(usage.inputTokens) · 출력 \(usage.outputTokens)\(usage.estimated ? " · 추정" : "")")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(BatonTheme.muted)
            }
        }
        .padding(14)
        .background(BatonTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isCheckpoint ? BatonTheme.amber.opacity(0.85) : Color.clear, lineWidth: 1.5)
        }
    }

    private var trimmedExplanation: String? {
        guard let explanation = role.explanation else {
            return nil
        }
        let trimmed = explanation.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct TeamRunStatusBadge: View {
    let status: String

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(Color(batonHex: tint.leadingHex))
                .frame(width: 8, height: 8)
            Text(teamRunStatusLabel(status))
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
        switch status {
        case "running":
            .running
        case "awaiting-approval", "awaiting-review", "awaiting-checkpoint":
            .awaitingApproval
        case "completed":
            .completed
        case "failed":
            .failed
        case "cancelled", "skipped":
            .muted
        default:
            .planned
        }
    }
}
