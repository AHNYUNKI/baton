import { describe, expect, it } from "vitest";

import { extractExplanation } from "../../src/index.js";

describe("extractExplanation", () => {
  it("extracts the learning explanation section through the end of stdout", () => {
    expect(
      extractExplanation(
        [
          "작업 완료",
          "",
          "## 학습 설명",
          "- 무엇을 했나: 역할을 실행했습니다.",
          "- 왜 이렇게 했나(결정 근거): 안전하게 검증하려고 했습니다."
        ].join("\n")
      )
    ).toBe("## 학습 설명\n- 무엇을 했나: 역할을 실행했습니다.\n- 왜 이렇게 했나(결정 근거): 안전하게 검증하려고 했습니다.");
  });

  it("returns undefined when stdout does not include the heading", () => {
    expect(extractExplanation("작업 완료\n설명 없음")).toBeUndefined();
  });

  it("returns the last explanation when multiple sections are present", () => {
    expect(
      extractExplanation(
        [
          "## 학습 설명",
          "- 무엇을 했나: 첫 설명입니다.",
          "## Result",
          "중간 결과",
          "## 학습 설명",
          "- 무엇을 했나: 마지막 설명입니다."
        ].join("\n")
      )
    ).toBe("## 학습 설명\n- 무엇을 했나: 마지막 설명입니다.");
  });

  it("trims surrounding whitespace and stops at the next same-level heading", () => {
    expect(
      extractExplanation(
        [
          "stdout",
          "",
          "  ",
          "## 학습 설명",
          "",
          "- 핵심 개념: stdout 섹션에서 필요한 부분만 추출합니다.",
          "",
          "## 다음 섹션",
          "이 내용은 제외됩니다."
        ].join("\n")
      )
    ).toBe("## 학습 설명\n\n- 핵심 개념: stdout 섹션에서 필요한 부분만 추출합니다.");
  });
});
