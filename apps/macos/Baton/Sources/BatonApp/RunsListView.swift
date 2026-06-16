import BatonKit
import SwiftUI

struct RunsListView: View {
    @ObservedObject var store: RunsStore
    let onNewRun: () -> Void
    @State private var filter: RunFilter = .all

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            header

            VStack(alignment: .leading, spacing: 8) {
                ForEach(RunFilter.allCases, id: \.self) { item in
                    filterButton(item)
                }
            }

            Divider()
                .overlay(BatonTheme.separator)

            ScrollView {
                LazyVStack(spacing: 12) {
                    if filteredRuns.isEmpty {
                        emptyState
                    } else {
                        ForEach(filteredRuns) { run in
                            RunCard(
                                run: run,
                                isSelected: store.selectedRunId == run.runId,
                                onSelect: {
                                    Task {
                                        await store.select(runId: run.runId)
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
                        }
                    }
                }
                .padding(.bottom, 12)
            }

            if let errorMessage = store.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Color(batonHex: "#FB7185"))
                    .lineLimit(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(BatonTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(18)
        .frame(minWidth: BatonTheme.sidebarWidth, maxWidth: BatonTheme.sidebarWidth, maxHeight: .infinity, alignment: .topLeading)
        .background(BatonTheme.background)
        .navigationTitle("실행")
        .toolbar {
            ToolbarItem {
                Button {
                    Task { await store.load() }
                } label: {
                    Label("새로고침", systemImage: "arrow.clockwise")
                }
                .disabled(store.isLoading)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("전체 실행")
                        .font(.system(size: 30, weight: .heavy))
                        .foregroundStyle(BatonTheme.cream)
                    Text("\(store.runs.count)개 실행")
                        .font(.callout)
                        .foregroundStyle(BatonTheme.muted)
                }
                Spacer()
                GradientButton(title: "새 실행", systemImage: "plus", action: onNewRun)
            }

            HStack(spacing: 6) {
                RoleBadge(role: "analyst")
                RoleBadge(role: "architect")
                RoleBadge(role: "implementer")
                RoleBadge(role: "tester")
            }
        }
    }

    private var filteredRuns: [RunSummary] {
        store.runs.filter(filter.matches)
    }

    private func filterButton(_ item: RunFilter) -> some View {
        Button {
            filter = item
        } label: {
            HStack {
                Label(item.label, systemImage: item.systemImage)
                    .font(.callout.weight(.bold))
                Spacer()
                Text("\(store.runs.filter(item.matches).count)")
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(BatonTheme.surfaceElevated)
                    .clipShape(Capsule())
            }
            .foregroundStyle(filter == item ? BatonTheme.cream : BatonTheme.muted)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(filter == item ? AnyShapeStyle(BatonTheme.softFill(.planned)) : AnyShapeStyle(Color.clear))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("실행이 없습니다")
                .font(.headline.weight(.bold))
                .foregroundStyle(BatonTheme.cream)
            Text("새 실행을 시작하면 여기에 카드로 표시됩니다.")
                .font(.callout)
                .foregroundStyle(BatonTheme.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BatonTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: BatonTheme.cardRadius, style: .continuous))
    }
}

private enum RunFilter: CaseIterable {
    case all
    case running
    case awaitingApproval
    case completed

    var label: String {
        switch self {
        case .all:
            "전체"
        case .running:
            "실행 중"
        case .awaitingApproval:
            "승인 대기"
        case .completed:
            "완료"
        }
    }

    var systemImage: String {
        switch self {
        case .all:
            "tray.full"
        case .running:
            "bolt.horizontal.circle"
        case .awaitingApproval:
            "exclamationmark.circle"
        case .completed:
            "checkmark.circle"
        }
    }

    func matches(_ run: RunSummary) -> Bool {
        switch self {
        case .all:
            true
        case .running:
            run.status == .running
        case .awaitingApproval:
            run.status == .awaitingApproval
        case .completed:
            run.status == .completed
        }
    }
}
