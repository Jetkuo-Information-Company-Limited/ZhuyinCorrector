import { describe, it, expect } from "vitest";
import correctorModule from "../src/zhuyin-corrector.js";

const { ZhuyinCorrector } = correctorModule;

describe("ZhuyinCorrector", () => {
  it("applies default rules and records change counts", () => {
    const corrector = new ZhuyinCorrector();
    const input = "我正在輸入 ㄓㄨˋㄧㄣ，修掉ㄔㄨㄛˋㄗˋ";
    const result = corrector.correctText(input);

    expect(result.correctedText).toContain("注音");
    expect(result.correctedText).toContain("錯字");
    expect(result.changes.length).toBeGreaterThan(0);
  });

  it("supports custom rules", () => {
    const corrector = new ZhuyinCorrector([{ from: "ㄉㄧㄢˇ", to: "點" }]);
    const result = corrector.correctText("請按ㄉㄧㄢˇ一下");

    expect(result.correctedText).toBe("請按點一下");
    expect(result.changes.some((c) => c.from === "ㄉㄧㄢˇ" && c.to === "點")).toBe(true);
  });

  it("ignores invalid custom rules safely", () => {
    const corrector = new ZhuyinCorrector([{ from: "", to: "X" }, { to: "Y" }, null]);
    const result = corrector.correctText("ㄓㄨˋㄧㄣ");

    expect(result.correctedText).toBe("注音");
  });

  it("returns empty changes for non-string or empty input", () => {
    const corrector = new ZhuyinCorrector();
    expect(corrector.correctText("").changes).toEqual([]);
    expect(corrector.correctText(undefined).changes).toEqual([]);
  });
});
