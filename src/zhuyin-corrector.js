(function (root, factory) {
  const exported = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }

  if (root) {
    root.ZhuyinCorrector = exported.ZhuyinCorrector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_RULES = [
    { from: "ㄐㄧㄢˋ", to: "鍵", note: "常見詞修正：注音輸入顯示字" },
    { from: "ㄓㄨˋㄧㄣ", to: "注音", note: "常見詞修正：注音字串" },
    { from: "ㄒㄩㄩㄥˋ", to: "使用", note: "示範規則，可自行替換" },
    { from: "ㄔㄨㄛˋㄗˋ", to: "錯字", note: "示範規則，可自行替換" }
  ];

  class ZhuyinCorrector {
    constructor(customRules = []) {
      this.rules = this.#normalizeRules([...DEFAULT_RULES, ...customRules]);
    }

    #normalizeRules(rules) {
      return rules
        .filter((rule) => rule && typeof rule.from === "string" && typeof rule.to === "string")
        .filter((rule) => rule.from.length > 0)
        .map((rule) => ({ from: rule.from, to: rule.to, note: rule.note || "" }));
    }

    updateCustomRules(customRules = []) {
      this.rules = this.#normalizeRules([...DEFAULT_RULES, ...customRules]);
    }

    correctText(inputText = "") {
      if (typeof inputText !== "string" || inputText.length === 0) {
        return { correctedText: inputText, changes: [] };
      }

      let correctedText = inputText;
      const changes = [];

      for (const rule of this.rules) {
        const occurrences = correctedText.split(rule.from).length - 1;
        if (occurrences > 0) {
          correctedText = correctedText.split(rule.from).join(rule.to);
          changes.push({
            from: rule.from,
            to: rule.to,
            count: occurrences,
            note: rule.note
          });
        }
      }

      return { correctedText, changes };
    }
  }

  return {
    ZhuyinCorrector,
    DEFAULT_RULES
  };
});
