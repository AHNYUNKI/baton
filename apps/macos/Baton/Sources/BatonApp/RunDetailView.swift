import BatonKit
import SwiftUI

struct RunDetailView: View {
    @ObservedObject var store: RunsStore

    var body: some View {
        ZStack {
            BatonTheme.background.ignoresSafeArea()
            if let detail = store.selectedDetail {
                detailView(detail)
            } else if let summary = selectedSummary {
                summaryFallback(summary)
            } else {
                emptyState
            }
        }
        .toolbar {
            ToolbarItemGroup {
                Button {
                    Task { await store.approveSelected() }
                } label: {
                    Label("승인", systemImage: "checkmark.circle")
                }
                .disabled(store.selectedRunId == nil)

                Button {
                    Task { await store.rejectSelected() }
                } label: {
                    Label("거부", systemImage: "xmark.circle")
                }
                .disabled(store.selectedRunId == nil)

                Button {
                    Task { await store.resumeSelected() }
                } label: {
                    Label("재개", systemImage: "play.circle")
                }
                .disabled(store.selectedRunId == nil)

                Button(role: .destructive) {
                    Task { await store.cleanSelected() }
                } label: {
                    Label("정리", systemImage: "trash")
                }
                .disabled(store.selectedRunId == nil)
            }
        }
    }

    private var selectedSummary: RunSummary? {
        guard let selectedRunId = store.selectedRunId else {
            return nil
        }
        return store.runs.first { $0.runId == selectedRunId }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "ticket")
                .font(.system(size: 42))
                .foregroundStyle(BatonTheme.muted)
            Text("선택된 실행이 없습니다")
                .font(.title3.weight(.bold))
                .foregroundStyle(BatonTheme.cream)
            Text("왼쪽 대시보드에서 실행 카드를 선택하세요.")
                .font(.callout)
                .foregroundStyle(BatonTheme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func summaryFallback(_ summary: RunSummary) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header(
                    runId: summary.runId,
                    status: summary.status,
                    request: nil,
                    workflowId: summary.workflowId,
                    createdAt: summary.createdAt,
                    updatedAt: summary.updatedAt
                )
                Text("상세 정보를 불러오는 중입니다...")
                    .foregroundStyle(BatonTheme.muted)
            }
            .padding(28)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func detailView(_ detail: RunDetail) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header(
                    runId: detail.run.id,
                    status: detail.run.status,
                    request: detail.run.request,
                    workflowId: detail.run.workflowId,
                    createdAt: detail.run.createdAt,
                    updatedAt: detail.run.updatedAt
                )
                if detail.run.status == .awaitingApproval {
                    approvalGateCallout
                }
                if let worktreePath = detail.run.worktreePath {
                    metadataRow("작업트리", worktreePath)
                }
                if let baseBranch = detail.run.baseBranch {
                    metadataRow("기준 브랜치", baseBranch)
                }
                if let cleanedAt = detail.run.cleanedAt {
                    metadataRow("정리 시각", cleanedAt)
                }

                section(title: "단계 타임라인") {
                    if detail.run.steps.isEmpty {
                        emptySectionText("표시할 단계가 없습니다")
                    } else {
                        VStack(alignment: .leading, spacing: 14) {
                            ForEach(detail.run.steps) { step in
                                stepRow(step)
                            }
                        }
                    }
                }

                section(title: "승인") {
                    let approvals = detail.run.approvals ?? []
                    if approvals.isEmpty {
                        emptySectionText("승인 기록이 없습니다")
                    } else {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(approvals, id: \.stepId) { approval in
                                approvalRow(approval)
                            }
                        }
                    }
                }

                section(title: "산출물") {
                    if detail.artifacts.isEmpty {
                        emptySectionText("산출물이 없습니다")
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(detail.artifacts, id: \.self) { artifact in
                                Label(artifact, systemImage: "doc.text")
                                    .font(.body.monospaced())
                                    .foregroundStyle(BatonTheme.cream)
                            }
                        }
                    }
                }
            }
            .padding(28)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func header(
        runId: String,
        status: RunStatus,
        request: String?,
        workflowId: String,
        createdAt: String,
        updatedAt: String?
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                Text(runId)
                    .font(.system(size: 34, weight: .heavy))
                    .foregroundStyle(BatonTheme.cream)
                    .lineLimit(1)
                Spacer()
                StatusPill(status: status)
            }
            if let request {
                Text(request)
                    .font(.title3)
                    .foregroundStyle(BatonTheme.cream)
            }
            metadataRow("워크플로우", workflowId)
            metadataRow("생성 시각", createdAt)
            if let updatedAt {
                metadataRow("갱신 시각", updatedAt)
            }
        }
        .padding(20)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }

    private func section<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline.weight(.heavy))
                .foregroundStyle(BatonTheme.cream)
            content()
        }
        .padding(18)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metadataRow(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(BatonTheme.muted)
                .frame(width: 82, alignment: .leading)
            Text(value)
                .font(.body)
                .foregroundStyle(BatonTheme.cream)
                .textSelection(.enabled)
        }
    }

    private func stepRow(_ step: RunStep) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(BatonTheme.gradient(StatusDisplay.tint(step.status)))
                .frame(width: 10, height: 10)
                .padding(.top, 8)

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(step.id)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(BatonTheme.cream)
                    RoleBadge(stepType: step.type)
                    Spacer()
                    StatusPill(status: step.status)
                }
                if let reason = step.reason {
                    Text(reason)
                        .foregroundStyle(BatonTheme.muted)
                }
                HStack(spacing: 12) {
                    if let startedAt = step.startedAt {
                        smallMetadata("시작", startedAt)
                    }
                    if let completedAt = step.completedAt {
                        smallMetadata("완료", completedAt)
                    }
                    if let attempts = step.attempts {
                        smallMetadata("시도", "\(attempts)")
                    }
                }
                if let artifacts = step.artifacts, !artifacts.isEmpty {
                    Text(artifacts.joined(separator: ", "))
                        .font(.caption.monospaced())
                        .foregroundStyle(BatonTheme.muted)
                        .lineLimit(2)
                }
            }
            .padding(12)
            .background(BatonTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private func approvalRow(_ approval: Approval) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(approval.stepId)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(BatonTheme.cream)
                Spacer()
                StatusPill(status: approval.status)
            }
            metadataRow("생성 시각", approval.createdAt)
            if let decidedAt = approval.decidedAt {
                metadataRow("결정 시각", decidedAt)
            }
            if let note = approval.note {
                Text(note)
                    .foregroundStyle(BatonTheme.muted)
            }
        }
        .padding(12)
        .background(BatonTheme.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func emptySectionText(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(BatonTheme.muted)
    }

    private var approvalGateCallout: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(BatonTheme.amber)
            VStack(alignment: .leading, spacing: 2) {
                Text("확인 필요")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(BatonTheme.cream)
                Text("이 실행은 승인 게이트에서 대기 중입니다.")
                    .font(.callout)
                    .foregroundStyle(BatonTheme.muted)
            }
        }
        .padding(14)
        .background(BatonTheme.softFill(.awaitingApproval))
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
    }

    private func smallMetadata(_ title: String, _ value: String) -> some View {
        HStack(spacing: 4) {
            Text(title)
                .font(.caption.weight(.bold))
                .foregroundStyle(BatonTheme.muted)
            Text(value)
                .font(.caption)
                .foregroundStyle(BatonTheme.cream)
        }
    }
}
