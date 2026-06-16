import BatonKit
import SwiftUI

struct RunsListView: View {
    @ObservedObject var store: RunsStore

    var body: some View {
        VStack(spacing: 0) {
            List(selection: selection) {
                ForEach(store.runs) { run in
                    RunsListRow(run: run)
                        .tag(Optional(run.runId))
                }
            }
            .navigationTitle("Runs")

            if let errorMessage = store.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .lineLimit(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
            }
        }
        .toolbar {
            ToolbarItem {
                Button {
                    Task { await store.load() }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .disabled(store.isLoading)
            }
        }
    }

    private var selection: Binding<String?> {
        Binding {
            store.selectedRunId
        } set: { runId in
            Task {
                await store.select(runId: runId)
            }
        }
    }
}

private struct RunsListRow: View {
    let run: RunSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(run.runId)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                StatusBadge(status: run.status)
            }
            HStack(spacing: 8) {
                Text(run.workflowId)
                Text("\(run.stepCount) steps")
                if run.dryRun {
                    Text("dry-run")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            Text(run.createdAt)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.vertical, 4)
    }
}

struct StatusBadge: View {
    let status: RunStatus

    var body: some View {
        Text(status.rawValue)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(backgroundColor.opacity(0.15))
            .foregroundStyle(backgroundColor)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var backgroundColor: Color {
        switch status {
        case .planned:
            .secondary
        case .running:
            .blue
        case .awaitingApproval:
            .orange
        case .completed:
            .green
        case .failed:
            .red
        case .cancelled:
            .gray
        }
    }
}
