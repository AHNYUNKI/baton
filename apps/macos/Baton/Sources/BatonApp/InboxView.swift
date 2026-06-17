import BatonKit
import SwiftUI

struct InboxView: View {
    @ObservedObject var store: RunsStore
    let onOpenRun: () -> Void

    private var pendingRuns: [RunSummary] {
        inboxRuns(store.runs)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header

                if pendingRuns.isEmpty {
                    emptyState
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(pendingRuns) { run in
                            RunCard(
                                run: run,
                                isSelected: store.selectedRunId == run.runId,
                                onSelect: {
                                    Task {
                                        await store.select(runId: run.runId)
                                        onOpenRun()
                                    }
                                },
                                onApprove: {
                                    Task {
                                        await store.select(runId: run.runId)
                                        await store.approveSelected()
                                    }
                                },
                                onReject: {
                                    Task {
                                        await store.select(runId: run.runId)
                                        await store.rejectSelected()
                                    }
                                }
                            )
                            .frame(maxWidth: 520)
                        }
                    }
                }

                if let errorMessage = store.errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(Color(batonHex: "#FB7185"))
                        .lineLimit(4)
                        .padding(12)
                        .frame(maxWidth: 620, alignment: .leading)
                        .background(BatonTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
            }
            .padding(30)
            .frame(maxWidth: 760, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("받은 함", systemImage: "tray.full")
                .font(.system(size: 34, weight: .heavy))
                .foregroundStyle(BatonTheme.cream)
            Text("승인 대기 중인 실행만 모아 봅니다.")
                .font(.title3)
                .foregroundStyle(BatonTheme.muted)
            Text("\(pendingRuns.count)개 승인 대기")
                .font(.callout.weight(.bold))
                .foregroundStyle(BatonTheme.cream)
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("승인 대기 항목이 없습니다")
                .font(.headline.weight(.bold))
                .foregroundStyle(BatonTheme.cream)
            Text("새 승인 요청이 생기면 이곳에 표시됩니다.")
                .font(.callout)
                .foregroundStyle(BatonTheme.muted)
        }
        .padding(18)
        .frame(maxWidth: 620, alignment: .leading)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous)
                .stroke(BatonTheme.separator, lineWidth: 1)
        }
    }
}
