(() => {
  const STORAGE_KEY = "zhuyinCorrectorSettings";
  const DEFAULT_SETTINGS = {
    enabled: true,
    customRules: []
  };
  const PANEL_ID = "zhuyin-editor-panel";
  const PANEL_WIDTH_DEFAULT = 420;
  const PANEL_WIDTH_MODE_DEFAULT = "default";
  const PANEL_WIDTH_MODE_HALF = "half";
  const DRAWER_TRANSITION_MS = 220;
  const PANEL_HTML_URL = chrome.runtime.getURL("panel/panel.html");
  const PANEL_ORIGIN = new URL(PANEL_HTML_URL).origin;

  let settings = { ...DEFAULT_SETTINGS };
  let corrector = new window.ZhuyinCorrector(settings.customRules);
  let panelState = null;
  let panelWidthMode = PANEL_WIDTH_MODE_HALF;

  function isEditableElement(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    const editableTags = ["textarea", "input"];

    if (editableTags.includes(tag)) {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      const disallowedTypes = ["checkbox", "radio", "button", "submit", "reset", "file", "color"];
      return !disallowedTypes.includes(type);
    }

    return Boolean(el.isContentEditable);
  }

  function getActiveEditable() {
    const active = document.activeElement;
    if (isEditableElement(active)) return active;

    const focusedEditable = document.querySelector("textarea:focus, input:focus, [contenteditable='true']:focus");
    return isEditableElement(focusedEditable) ? focusedEditable : null;
  }

  function getTextFromElement(el) {
    if (!el) return "";
    if (el.isContentEditable) return el.innerText || "";
    return el.value || "";
  }

  function setTextToElement(el, newText) {
    if (!el) return;

    if (el.isContentEditable) {
      el.innerText = newText;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return;
    }

    el.value = newText;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function showToast(message, timeoutMs = 1800) {
    const id = "zhuyin-corrector-toast";
    let toast = document.getElementById(id);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = id;
      toast.style.cssText = [
        "position: fixed",
        "top: 16px",
        "right: 16px",
        "z-index: 2147483647",
        "padding: 10px 14px",
        "border-radius: 10px",
        "background: #1f2937",
        "color: #fff",
        "font-size: 13px",
        "box-shadow: 0 8px 20px rgba(0,0,0,.25)",
        "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      ].join(";");
      document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.style.opacity = "0";
    }, timeoutMs);
  }

  function postToPanel(type, payload = {}) {
    if (!panelState?.iframe?.contentWindow) return;
    panelState.iframe.contentWindow.postMessage(
      {
        source: "zhuyin-content-script",
        type,
        payload
      },
      PANEL_ORIGIN
    );
  }

  function applyPageOffset(open) {
    // Overlay mode: do not shift page layout.
    void open;
  }

  function getPanelWidth() {
    if (panelWidthMode === PANEL_WIDTH_MODE_HALF) {
      return Math.max(PANEL_WIDTH_DEFAULT, Math.floor(window.innerWidth / 2));
    }
    return PANEL_WIDTH_DEFAULT;
  }

  function syncPanelWidthMode() {
    postToPanel("PANEL_WIDTH_MODE", { mode: panelWidthMode });
  }

  function applyPanelWidth() {
    if (!panelState?.root) return;
    panelState.root.style.width = `${getPanelWidth()}px`;
    applyPageOffset(true);
  }

  function togglePanelWidthMode() {
    panelWidthMode =
      panelWidthMode === PANEL_WIDTH_MODE_DEFAULT ? PANEL_WIDTH_MODE_HALF : PANEL_WIDTH_MODE_DEFAULT;
    applyPanelWidth();
    syncPanelWidthMode();
  }

  function loadActiveTextToPanel() {
    const target = getActiveEditable();
    if (!target) {
      postToPanel("SET_STATUS", { message: "請先點選輸入欄位，再載入文字。", kind: "warn" });
      return;
    }
    postToPanel("SET_EDITOR_TEXT", { text: getTextFromElement(target) });
    postToPanel("SET_STATUS", { message: "已載入目前欄位內容。", kind: "ok" });
  }

  function applyPanelTextToActiveField(text) {
    const target = getActiveEditable();
    if (!target) {
      postToPanel("SET_STATUS", { message: "找不到可套用的輸入欄位。", kind: "warn" });
      return;
    }
    setTextToElement(target, text || "");
    postToPanel("SET_STATUS", { message: "已套用面板文字到目前欄位。", kind: "ok" });
  }

  function correctPanelText(text) {
    const original = text || "";
    const result = corrector.correctText(original);
    postToPanel("SET_EDITOR_TEXT", { text: result.correctedText });
    if (result.changes.length === 0) {
      postToPanel("SET_STATUS", { message: "沒有偵測到可校正內容。", kind: "info" });
      return;
    }
    const totalChanges = result.changes.reduce((acc, item) => acc + item.count, 0);
    postToPanel("SET_STATUS", { message: `已完成校正，共 ${totalChanges} 處。`, kind: "ok" });
  }

  function copyTextFromPanel(text) {
    const content = typeof text === "string" ? text : "";
    if (!content) {
      postToPanel("SET_STATUS", { message: "目前沒有可複製內容。", kind: "warn" });
      return;
    }

    const ta = document.createElement("textarea");
    ta.value = content;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.width = "1px";
    ta.style.height = "1px";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.documentElement.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    ta.remove();

    if (ok) {
      postToPanel("SET_STATUS", { message: "已複製轉換後文字。", kind: "ok" });
      return;
    }

    postToPanel("SET_STATUS", { message: "複製失敗，請手動複製。", kind: "warn" });
  }

  function closeEditorPanel() {
    if (!panelState?.root) return;
    hideEditorPanelDrawer();
  }

  function createEditorPanel() {
    const root = document.createElement("aside");
    root.id = PANEL_ID;
    root.style.cssText = [
      "position: fixed",
      "top: 0",
      "right: 0",
      `width: ${getPanelWidth()}px`,
      "height: 100vh",
      "background: #ffffff",
      "z-index: 2147483646",
      "box-shadow: -8px 0 24px rgba(0,0,0,.16)",
      "display: flex",
      "flex-direction: column",
      "transform: translateX(100%)",
      `transition: transform ${DRAWER_TRANSITION_MS}ms ease`,
      "border-left: 1px solid #e2e8f0",
      "overflow: hidden"
    ].join(";");
    const iframe = document.createElement("iframe");
    iframe.src = PANEL_HTML_URL;
    iframe.title = "注音校正編輯器面板";
    iframe.style.cssText = "width:100%;height:100%;border:0;display:block;background:#fff;";
    root.appendChild(iframe);

    document.documentElement.appendChild(root);
    panelState = { root, iframe, visible: false, hideTimer: null };
  }

  function showEditorPanelDrawer() {
    if (!panelState?.root) return;
    if (panelState.hideTimer) {
      clearTimeout(panelState.hideTimer);
      panelState.hideTimer = null;
    }
    panelState.root.style.display = "flex";
    applyPageOffset(true);
    requestAnimationFrame(() => {
      if (!panelState?.root) return;
      panelState.root.style.transform = "translateX(0)";
      panelState.visible = true;
    });
  }

  function hideEditorPanelDrawer() {
    if (!panelState?.root) return;
    panelState.root.style.transform = "translateX(100%)";
    panelState.visible = false;
    applyPageOffset(false);
    panelState.hideTimer = setTimeout(() => {
      if (!panelState?.root) return;
      panelState.root.style.display = "none";
    }, DRAWER_TRANSITION_MS + 20);
  }

  function handlePanelMessage(event) {
    if (!panelState?.iframe?.contentWindow) return;
    if (event.source !== panelState.iframe.contentWindow) return;
    if (event.origin !== PANEL_ORIGIN) return;

    const data = event.data || {};
    if (data.source !== "zhuyin-panel") return;

    if (data.type === "PANEL_READY") {
      postToPanel("SET_STATUS", { message: "已開啟側邊編輯器。", kind: "info" });
      syncPanelWidthMode();
      loadActiveTextToPanel();
      return;
    }

    if (data.type === "LOAD_ACTIVE_FIELD") {
      loadActiveTextToPanel();
      return;
    }

    if (data.type === "APPLY_TO_ACTIVE_FIELD") {
      applyPanelTextToActiveField(data.payload?.text || "");
      return;
    }

    if (data.type === "CORRECT_TEXT") {
      correctPanelText(data.payload?.text || "");
      return;
    }

    if (data.type === "CLOSE_PANEL") {
      closeEditorPanel();
      return;
    }

    if (data.type === "COPY_TEXT") {
      copyTextFromPanel(data.payload?.text || "");
      return;
    }

    if (data.type === "TOGGLE_PANEL_WIDTH") {
      togglePanelWidthMode();
    }
  }

  function openEditorPanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      const iframe = existing.querySelector("iframe");
      panelState = {
        root: existing,
        iframe,
        visible: existing.style.display !== "none",
        hideTimer: panelState?.hideTimer || null
      };
      if (!panelState.visible) {
        showEditorPanelDrawer();
        postToPanel("SET_STATUS", { message: "側邊編輯器已開啟。", kind: "info" });
        return { ok: true, opened: true };
      }
      postToPanel("SET_STATUS", { message: "側邊編輯器已在目前頁面開啟。", kind: "info" });
      return { ok: true, opened: false };
    }

    createEditorPanel();
    showEditorPanelDrawer();
    return { ok: true, opened: true };
  }

  function correctCurrentField() {
    if (!settings.enabled) {
      return { ok: false, reason: "disabled" };
    }

    const target = getActiveEditable();
    if (!target) {
      return { ok: false, reason: "no-active-editable" };
    }

    const original = getTextFromElement(target);
    const result = corrector.correctText(original);

    if (result.correctedText !== original) {
      setTextToElement(target, result.correctedText);
      return {
        ok: true,
        changed: true,
        changeCount: result.changes.reduce((acc, x) => acc + x.count, 0),
        details: result.changes
      };
    }

    return { ok: true, changed: false, changeCount: 0, details: [] };
  }

  async function loadSettings() {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    settings = { ...DEFAULT_SETTINGS, ...(data[STORAGE_KEY] || {}) };
    corrector.updateCustomRules(settings.customRules || []);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !changes[STORAGE_KEY]) return;
    settings = { ...DEFAULT_SETTINGS, ...(changes[STORAGE_KEY].newValue || {}) };
    corrector.updateCustomRules(settings.customRules || []);
  });

  window.addEventListener("resize", () => {
    if (!panelState?.root) return;
    if (panelWidthMode !== PANEL_WIDTH_MODE_HALF) return;
    applyPanelWidth();
  });

  window.addEventListener("message", handlePanelMessage);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "OPEN_EDITOR_PANEL") {
      const result = openEditorPanel();
      sendResponse(result);
      return true;
    }

    if (message?.type === "CLOSE_EDITOR_PANEL") {
      closeEditorPanel();
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === "CORRECT_ACTIVE_FIELD") {
      const result = correctCurrentField();

      if (!result.ok && result.reason === "disabled") {
        showToast("注音校正已停用，請先在插件中啟用");
      } else if (!result.ok && result.reason === "no-active-editable") {
        showToast("請先點選輸入框或可編輯區塊");
      } else if (result.changed) {
        showToast(`已完成校正，共 ${result.changeCount} 處`);
      } else {
        showToast("沒有偵測到可校正內容");
      }

      sendResponse(result);
      return true;
    }

    if (message?.type === "PING") {
      sendResponse({ ok: true, source: "zhuyin-content-script" });
      return true;
    }

    return false;
  });

  loadSettings().catch((err) => {
    console.error("[ZhuyinCorrector] loadSettings failed:", err);
  });
})();
