import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./panel.css";

const ICON_EXPAND_SRC = "icons/maximize-2.svg";
const ICON_COLLAPSE_SRC = "icons/minimize-2.svg";
const ICON_CLOSE_SRC = "icons/x.svg";
const LOGO_SRC = "images/logo.jpg";
const PANEL_VERSION = "v0.1.0";
const URL_QIANYI = "https://qianyiedutech.com/";
const URL_QIANYI_LOGO = "https://newsy365.com/assets/images/teams/qianyiedutech.jpg";
const URL_JETKUO = "https://jetkuo.com";
const URL_JETKUO_LOGO = "https://newsy365.com/assets/images/teams/jetkuo.png";
const URL_BUTKO = "https://github.com/ButTaiwan";
const ISSUE_EMAIL = "shawnli@jetkuo.com";

function App() {
  const [editorText, setEditorText] = useState("");
  const [charItems, setCharItems] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [zuyinMap, setZuyinMap] = useState({});
  const [poyinMap, setPoyinMap] = useState({});
  const [poyinReady, setPoyinReady] = useState(false);
  const [copySucceeded, setCopySucceeded] = useState(false);
  const [viewMode, setViewMode] = useState("edit");
  const [status, setStatus] = useState({ message: "準備中...", kind: "info" });
  const [widthMode, setWidthMode] = useState("default");
  const copySuccessTimerRef = useRef(null);

  const widthIconSrc = useMemo(
    () => (widthMode === "half" ? ICON_COLLAPSE_SRC : ICON_EXPAND_SRC),
    [widthMode]
  );

  const widthTitle = widthMode === "half" ? "切回目前寬度" : "切換為半頁寬";

  function postToParent(type, payload = {}) {
    window.parent.postMessage(
      {
        source: "zhuyin-panel",
        type,
        payload
      },
      "*"
    );
  }

  function isCjkChar(char) {
    return /[\u3400-\u9fff]/u.test(char);
  }

  function isVariationSelector(char) {
    const codePoint = char.codePointAt(0);
    return (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);
  }

  function stripVariationSelectors(text) {
    if (!text) return "";
    // Remove both BMP variation selectors and IVS selectors (U+E0100..U+E01EF in UTF-16 pairs).
    return text.replace(/[\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]/g, "");
  }

  function tokenizeText(text) {
    if (!text) return [];
    const units = [];
    for (const char of Array.from(text)) {
      if (isVariationSelector(char) && units.length > 0) {
        const prev = units[units.length - 1];
        if (prev.type !== "linebreak") {
          prev.raw += char;
          prev.hasVariationSelector = true;
          prev.baseChar = stripVariationSelectors(prev.raw);
          continue;
        }
      }

      units.push({
        raw: char,
        baseChar: stripVariationSelectors(char),
        hasVariationSelector: false,
        type: char === "\n" ? "linebreak" : "text"
      });
    }
    return units;
  }

  function parseCsvLine(line) {
    const commaIndex = line.indexOf(",");
    if (commaIndex < 0) return null;

    const baseChar = line.slice(0, commaIndex).trim();
    if (!baseChar) return null;

    let rawVariants = line.slice(commaIndex + 1).trim();
    if (rawVariants.startsWith('"') && rawVariants.endsWith('"')) {
      rawVariants = rawVariants.slice(1, -1);
    }

    const variants = rawVariants
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    const uniq = Array.from(new Set([baseChar, ...variants]));
    return [baseChar, uniq];
  }

  function parsePoyinDb(jsText) {
    const start = jsText.indexOf("{");
    const end = jsText.lastIndexOf("};");
    if (start < 0 || end < 0 || end <= start) {
      throw new Error("invalid poyin_db.js format");
    }
    const jsonText = jsText.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(jsonText);
  }

  function matchPatternAt(chars, index, targetChar, pattern) {
    if (!pattern || typeof pattern !== "string") return false;
    const pos = pattern.indexOf("*");
    if (pos < 0) return false;

    const start = index - pos;
    if (start < 0) return false;
    if (start + pattern.length > chars.length) return false;

    const segment = chars.slice(start, start + pattern.length).join("");
    const expected = pattern.replace("*", targetChar);
    return segment === expected;
  }

  function pickVariantIndex(chars, index, baseChar, dbEntry) {
    if (!dbEntry || !Array.isArray(dbEntry.v)) return 0;

    for (let variantIndex = 0; variantIndex < dbEntry.v.length; variantIndex += 1) {
      const rawPatterns = dbEntry.v[variantIndex];
      if (!rawPatterns) continue;
      const patterns = rawPatterns.split("/").filter(Boolean);
      for (const pattern of patterns) {
        if (matchPatternAt(chars, index, baseChar, pattern)) {
          return variantIndex;
        }
      }
    }

    return 0;
  }

  function buildCharItems(text, map, db) {
    if (!text) return [];
    const units = tokenizeText(text);
    const charsForPattern = units.map((unit) => {
      if (unit.type === "linebreak") return "\n";
      return unit.baseChar || unit.raw;
    });

    return units.map((unit, index) => {
      const char = unit.baseChar || unit.raw;
      if (unit.type === "linebreak") return { type: "linebreak", baseChar: char, value: unit.raw, options: [] };
      if (!isCjkChar(char)) return { type: "plain", baseChar: char, value: unit.raw, options: [] };

      const mappedOptions = map[char];
      const options = mappedOptions || [char];
      const isPolyphonic = Array.isArray(mappedOptions) && mappedOptions.length > 1;
      const dbEntry = db[char];
      const autoIndex = isPolyphonic ? pickVariantIndex(charsForPattern, index, char, dbEntry) : 0;
      const normalizedIndex = autoIndex >= 0 && autoIndex < options.length ? autoIndex : 0;
      const hasPresetVariant = unit.hasVariationSelector;
      const nextValue = hasPresetVariant ? unit.raw : options[normalizedIndex] || char;

      return {
        type: "cjk",
        baseChar: char,
        value: nextValue,
        options,
        isPolyphonic,
        autoAdjusted: hasPresetVariant ? false : normalizedIndex > 0,
        userAdjusted: false
      };
    });
  }

  function getCurrentOptions() {
    if (selectedIndex < 0) return [];
    const item = charItems[selectedIndex];
    if (!item || item.type !== "cjk" || !item.isPolyphonic) return [];
    return item.options || [];
  }

  function handleChooseVariant(variant) {
    if (selectedIndex < 0) return;
    setCharItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== selectedIndex || item.type !== "cjk") return item;
        return { ...item, value: variant, userAdjusted: true };
      })
    );
    setStatus({ message: "已替換破音字。", kind: "ok" });
  }

  function handleConvertToZhuyin() {
    if (!poyinReady) {
      setStatus({ message: "破音字 pattern 規則尚未載入完成。", kind: "warn" });
      return;
    }

    const items = buildCharItems(editorText, zuyinMap, poyinMap);
    const firstCjk = items.findIndex((x) => x.type === "cjk" && x.isPolyphonic);
    setCharItems(items);
    setSelectedIndex(firstCjk);
    setViewMode("result");
    const autoAdjustedCount = items.filter((x) => x.type === "cjk" && x.autoAdjusted).length;
    setStatus({ message: `請點選中文字，再選擇下方破音字。已自動調整 ${autoAdjustedCount} 字。`, kind: "ok" });
  }

  function handleBackToEdit() {
    setViewMode("edit");
    setStatus({ message: "已切回編輯模式。", kind: "info" });
  }

  function handleOpenTeamPage() {
    setViewMode("team");
  }

  function handleOpenCopyrightPage() {
    setViewMode("copyright");
  }

  function handleBackToWorkPage() {
    setViewMode("result");
  }

  function getConvertedPlainText() {
    if (!Array.isArray(charItems) || charItems.length === 0) return "";
    return charItems
      .map((item) => {
        if (item.type === "linebreak") return "\n";
        return item.value || "";
      })
      .join("");
  }

  async function handleCopyText() {
    const textToCopy = getConvertedPlainText();
    if (!textToCopy) {
      setStatus({ message: "目前沒有可複製內容。", kind: "warn" });
      return;
    }
    setCopySucceeded(false);
    postToParent("COPY_TEXT", { text: textToCopy });
    setStatus({ message: "複製中...", kind: "info" });
  }

  useEffect(() => {
    fetch("zuyin_map.csv")
      .then((res) => res.text())
      .then((csvText) => {
        const nextMap = {};
        const lines = csvText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        for (const line of lines) {
          const parsed = parseCsvLine(line);
          if (!parsed) continue;
          nextMap[parsed[0]] = parsed[1];
        }
        setZuyinMap(nextMap);
        setStatus({ message: `已載入破音字清單，共 ${Object.keys(nextMap).length} 筆。`, kind: "info" });
      })
      .catch(() => {
        setStatus({ message: "破音字清單載入失敗。", kind: "warn" });
      });
  }, []);

  useEffect(() => {
    fetch("poyin_db.js")
      .then((res) => res.text())
      .then((jsText) => {
        const parsed = parsePoyinDb(jsText);
        if (parsed && typeof parsed === "object") {
          setPoyinMap(parsed);
          setPoyinReady(true);
        }
      })
      .catch(() => {
        setPoyinReady(false);
        setStatus({ message: "破音字 pattern 規則載入失敗。", kind: "warn" });
      });
  }, []);

  useEffect(() => {
    function onMessage(event) {
      const data = event.data || {};
      if (data.source !== "zhuyin-content-script") return;
      if (data.type === "PANEL_WIDTH_MODE") {
        const mode = data.payload?.mode || "default";
        setWidthMode(mode);
        return;
      }

      if (data.type === "SET_EDITOR_TEXT") {
        const nextText = data.payload?.text || "";
        setEditorText(nextText);
        setCharItems([]);
        setSelectedIndex(-1);
        setViewMode("edit");
        setCopySucceeded(false);
      }

      if (data.type === "SET_STATUS") {
        const nextStatus = {
          message: data.payload?.message || "",
          kind: data.payload?.kind || "info"
        };
        setStatus(nextStatus);

        if (nextStatus.kind === "ok" && nextStatus.message.includes("已複製")) {
          setCopySucceeded(true);
          if (copySuccessTimerRef.current) {
            clearTimeout(copySuccessTimerRef.current);
          }
          copySuccessTimerRef.current = setTimeout(() => {
            setCopySucceeded(false);
          }, 1600);
        }
      }
    }

    window.addEventListener("message", onMessage);
    postToParent("PANEL_READY");
    return () => {
      window.removeEventListener("message", onMessage);
      if (copySuccessTimerRef.current) {
        clearTimeout(copySuccessTimerRef.current);
      }
    };
  }, []);

  return (
    <main className="panel">
      <header className="panel-header">
        <h1 className="panel-title">
          <span>注音校正編輯器 {PANEL_VERSION}</span>
        </h1>
        <div className="header-actions">
          <button
            id="widthToggleBtn"
            className="ghost icon-btn"
            type="button"
            title={widthTitle}
            aria-label={widthTitle}
            onClick={() => postToParent("TOGGLE_PANEL_WIDTH")}
          >
            <img src={widthIconSrc} alt="" />
          </button>

          <button
            id="closeBtn"
            className="ghost icon-btn"
            type="button"
            title="關閉面板"
            aria-label="關閉面板"
            onClick={() => postToParent("CLOSE_PANEL")}
          >
            <img src={ICON_CLOSE_SRC} alt="" />
          </button>
        </div>
      </header>

      {viewMode === "team" ? (
        <section className="content-section info-page">
          <h2>開發團隊</h2>

          <div className="info-card company-row">
            <img src={URL_QIANYI_LOGO} alt="謙懿科技 Logo" className="team-logo" />
            <div className="company-text">
              <div className="info-label">發行方</div>
              <a href={URL_QIANYI} target="_blank" rel="noreferrer">
                謙懿科技
              </a>
            </div>
          </div>

          <div className="info-card company-row">
            <img src={URL_JETKUO_LOGO} alt="杰果資訊 Logo" className="team-logo" />
            <div className="company-text">
              <div className="info-label">開發團隊</div>
              <a href={URL_JETKUO} target="_blank" rel="noreferrer">
                杰果資訊
              </a>
            </div>
          </div>

          <div className="info-card">
            <div className="info-label">問題回報</div>
            <a href={`mailto:${ISSUE_EMAIL}`}>{ISSUE_EMAIL}</a>
          </div>

          <div className="bottom-actions">
            <button type="button" className="ghost" onClick={handleBackToWorkPage}>
              返回校正頁
            </button>
          </div>
        </section>
      ) : viewMode === "copyright" ? (
        <section className="content-section info-page">
          <h2>版權聲明</h2>

          <div className="info-card">
            <div className="info-label">本插件使用與衍生聲明</div>
            <p className="license-text">
              本插件使用注音字型與經整理之破音字資料庫、設計概念，延伸自 ButKo 的
              <br />
              Bopomofo IVS Font Specification（注音 IVS 字型規格）專案：
              <br />
              <a href="https://github.com/ButTaiwan/bpmfvs" target="_blank" rel="noreferrer">
                https://github.com/ButTaiwan/bpmfvs
              </a>
              <br />
              <br />
              本插件內使用與衍生之相關資料（如 `poyin_db.js`），
              <br />
              依各來源授權條款與標示規範使用。
            </p>
          </div>

          <div className="info-card">
            <div className="info-label">原作者聲明與授權文件</div>
            <p className="license-text">
              原作者聲明（NOTICE）：
              <br />
              <a href="https://github.com/ButTaiwan/bpmfvs/blob/master/NOTICE.txt" target="_blank" rel="noreferrer">
                https://github.com/ButTaiwan/bpmfvs/blob/master/NOTICE.txt
              </a>
              <br />
              <br />
              本插件內附授權文件：
              <br />
              <a href="./NOTICE.txt" target="_blank" rel="noreferrer">
                NOTICE.txt
              </a>
              {" / "}
              <a href="./LICENSE-2.0.txt" target="_blank" rel="noreferrer">
                LICENSE-2.0.txt
              </a>
              <br />
              <br />
              Apache License 2.0 全文：
              <br />
              <a href="http://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">
                http://www.apache.org/licenses/LICENSE-2.0
              </a>
            </p>
          </div>

          <div className="bottom-actions">
            <button type="button" className="ghost" onClick={handleBackToWorkPage}>
              返回校正頁
            </button>
          </div>
        </section>
      ) : viewMode === "edit" ? (
        <>
          <section className="content-section">
            <textarea
              id="editor"
              value={editorText}
              onChange={(event) => setEditorText(event.target.value)}
              placeholder="在這裡輸入要轉換的內容..."
            />
          </section>

          <div className="bottom-actions">
            <button id="convertBtn" type="button" className="success" onClick={handleConvertToZhuyin}>
              開始校正注音
            </button>
          </div>
        </>
      ) : (
        <>
          <section className="content-section">
            <div className="color-legend">
              <span className="legend-item">
                <span className="legend-dot legend-poly" />
                預設破音字
              </span>
              <span className="legend-item">
                <span className="legend-dot legend-auto" />
                系統自動調整
              </span>
              <span className="legend-item">
                <span className="legend-dot legend-manual" />
                使用者手動調整
              </span>
            </div>
            <div className="html-preview-wrap">
              <div id="htmlPreview" className="html-preview">
                {charItems.length === 0 ? (
                  <span className="html-placeholder">沒有可顯示的內容。</span>
                ) : (
                  <div className="zhuyin-render">
                    {charItems.map((item, idx) => {
                      if (item.type === "linebreak") return <br key={`br-${idx}`} />;

                      if (item.type === "plain") {
                        return (
                          <span key={`plain-${idx}`} className="plain-char">
                            {item.value}
                          </span>
                        );
                      }

                      const isSelected = selectedIndex === idx;
                      const selectable = Boolean(item.isPolyphonic);
                      return (
                        <span
                          key={`cjk-${idx}`}
                          className={`${selectable ? "clickable-char" : "non-poly-char"} ${item.autoAdjusted ? "auto-adjusted" : ""} ${item.userAdjusted ? "manual-adjusted" : ""} ${isSelected ? "is-selected" : ""}`}
                          onClick={() => {
                            if (!selectable) return;
                            setSelectedIndex(idx);
                          }}
                        >
                          {item.value}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="bottom-actions">
            <div className="bottom-header-row">
              <div className="zhuyin-select-hint">請選擇注音字:</div>
              <div className="bottom-header-actions">
                <button
                  id="copyTextBtn"
                  type="button"
                  className={`ghost copy-btn ${copySucceeded ? "copy-success" : ""}`.trim()}
                  onClick={handleCopyText}
                >
                  {copySucceeded ? <span className="copy-check">✓</span> : null}
                  {copySucceeded ? "複製成功" : "複製全部"}
                </button>
                <button id="backToEditBtn" type="button" className="ghost" onClick={handleBackToEdit}>
                  返回編輯
                </button>
              </div>
            </div>
            <div className="candidate-row">
              <div className="candidate-list">
                {getCurrentOptions().length > 0 ? (
                  getCurrentOptions().map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      className="ghost candidate-btn"
                      onClick={() => handleChooseVariant(candidate)}
                    >
                      {candidate}
                    </button>
                  ))
                ) : (
                  <span className="html-placeholder">請先點選上方的中文字。</span>
                )}
              </div>
              <div className="candidate-side-meta">
                <button type="button" className="meta-link-btn" onClick={handleOpenTeamPage}>
                  開發團隊
                </button>
                <button type="button" className="meta-link-btn" onClick={handleOpenCopyrightPage}>
                  版權聲明
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <footer className={`status ${status.kind === "ok" || status.kind === "warn" ? status.kind : ""}`.trim()}>
        <span id="status">{status.message}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
