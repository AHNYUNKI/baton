import BatonKit
import SwiftUI

struct RunDetailView: View {
    @ObservedObject var store: RunsStore

    var body: some View {
        VStack(spacing: 0) {
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
                    Label("Approve", systemImage: "checkmark.circle")
                }
                .disabled(store.selectedRunId == nil)

                Button {
                    Task { await store.rejectSelected() }
                } label: {
                    Label("Reject", systemImage: "xmark.circle")
                }
                .disabled(store.selectedRunId == nil)

                Button {
                    Task { await store.resumeSelected() }
                } label: {
                    Label("Resume", systemImage: "play.circle")
                }
                .disabled(store.selectedRunId == nil)

                Button(role: .destructive) {
                    Task { await store.cleanSelected() }
                } label: {
                    Label("Clean", systemImage: "trash")
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
            Image(systemName: "list.bullet.rectangle")
                .font(.system(size: 42))
                .foregroundStyle(.secondary)
            Text("No run selected")
                .font(.title3)
                .foregroundStyle(.secondary)
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
                Text("Loading detail...")
                    .foregroundStyle(.secondary)
            }
            .padding(24)
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
                if let worktreePath = detail.run.worktreePath {
                    metadataRow("Worktree", worktreePath)
                }
                if let baseBranch = detail.run.baseBranch {
                    metadataRow("Base", baseBranch)
                }
                if let cleanedAt = detail.run.cleanedAt {
                    metadataRow("Cleaned", cleanedAt)
                }

                section(title: "Steps") {
                    if detail.run.steps.isEmpty {
                        emptySectionText("No steps")
                    } else {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(detail.run.steps) { step in
                                stepRow(step)
                                Divider()
                            }
                        }
                    }
                }

                section(title: "Approvals") {
                    let approvals = detail.run.approvals ?? []
                    if approvals.isEmpty {
                        emptySectionText("No approvals")
                    } else {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(approvals, id: \.stepId) { approval in
                                approvalRow(approval)
                                Divider()
                            }
                        }
                    }
                }

                section(title: "Artifacts") {
                    if detail.artifacts.isEmpty {
                        emptySectionText("No artifacts")
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(detail.artifacts, id: \.self) { artifact in
                                Label(artifact, systemImage: "doc.text")
                                    .font(.body.monospaced())
                            }
                        }
                    }
                }
            }
            .padding(24)
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
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(runId)
                    .font(.largeTitle.weight(.semibold))
                    .lineLimit(1)
                StatusBadge(status: status)
            }
            if let request {
                Text(request)
                    .font(.title3)
                    .foregroundStyle(.secondary)
            }
            metadataRow("Workflow", workflowId)
            metadataRow("Created", createdAt)
            if let updatedAt {
                metadataRow("Updated", updatedAt)
            }
        }
    }

    private func section<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metadataRow(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 72, alignment: .leading)
            Text(value)
                .font(.body)
                .textSelection(.enabled)
        }
    }

    private func stepRow(_ step: RunStep) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(step.id)
                    .font(.headline)
                Text(step.type.rawValue)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(step.status.rawValue)
                    .font(.caption.weight(.semibold))
            }
            if let reason = step.reason {
                Text(reason)
                    .foregroundStyle(.secondary)
            }
            if let startedAt = step.startedAt {
                metadataRow("Started", startedAt)
            }
            if let completedAt = step.completedAt {
                metadataRow("Done", completedAt)
            }
        }
    }

    private func approvalRow(_ approval: Approval) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(approval.stepId)
                    .font(.headline)
                Spacer()
                Text(approval.status.rawValue)
                    .font(.caption.weight(.semibold))
            }
            metadataRow("Created", approval.createdAt)
            if let decidedAt = approval.decidedAt {
                metadataRow("Decided", decidedAt)
            }
            if let note = approval.note {
                Text(note)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func emptySectionText(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(.secondary)
    }
}
