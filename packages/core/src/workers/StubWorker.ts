import type { WorkerAdapter, WorkerRunInput, WorkerRunResult } from "./WorkerAdapter.js";

export class StubWorker implements WorkerAdapter {
  public async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    if (input.onOutput !== undefined) {
      emitOutput(input.onOutput, "StubWorker: preparing deterministic role output\n");
      emitOutput(input.onOutput, "StubWorker: writing synthetic progress chunk\n");
      emitOutput(input.onOutput, "StubWorker: completed without external AI\n");
    }

    return {
      success: true,
      exitCode: 0,
      stdout: [
        "StubWorker completed this step without invoking an external AI worker.",
        `cwd: ${input.cwd}`,
        "stub: true",
        "",
        "## 학습 설명",
        "- 무엇을 했나: 외부 AI 워커를 호출하지 않고 StubWorker가 역할 실행을 성공으로 마무리했습니다.",
        "- 왜 이렇게 했나(결정 근거): 테스트와 로컬 검증에서 토큰이나 실제 로그인 없이 TeamRun 흐름을 확인하기 위해서입니다.",
        "- 핵심 개념: StubWorker는 실제 구현 대신 정해진 성공 출력을 돌려주는 테스트용 워커입니다.",
        "- 대안과 트레이드오프: 실제 Codex나 Claude를 호출하면 더 현실적인 결과를 얻지만 비용과 인증 의존성이 생깁니다."
      ].join("\n"),
      stderr: "",
      durationMs: 0,
      artifacts: [],
      metadata: {
        provider: "stub",
        stub: true,
        message: "StubWorker did not execute provider-specific code."
      }
    };
  }
}

function emitOutput(onOutput: (chunk: string) => void, chunk: string): void {
  try {
    onOutput(chunk);
  } catch {
    // Streaming observers must never change worker execution semantics.
  }
}
