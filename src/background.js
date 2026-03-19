const STORAGE_KEY = "zhuyinCorrectorSettings";
const DEFAULT_SETTINGS = {
  enabled: true,
  customRules: []
};

async function ensureDefaultSettings() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  if (!data[STORAGE_KEY]) {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: DEFAULT_SETTINGS
    });
  }
}

async function trySendMessageToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    return { ok: false, reason: "content-script-unavailable", error: String(error) };
  }
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/zhuyin-corrector.js", "src/content-script.js"]
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "cannot-inject", error: String(error) };
  }
}

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: false, reason: "no-active-tab" };
  }

  let result = await trySendMessageToTab(tab.id, message);
  if (result?.ok || result?.reason !== "content-script-unavailable") {
    return result;
  }

  const injectResult = await injectContentScript(tab.id);
  if (!injectResult.ok) return injectResult;

  result = await trySendMessageToTab(tab.id, message);
  return result;
}

async function runCorrection() {
  const result = await sendToActiveTab({ type: "CORRECT_ACTIVE_FIELD" });

  if (!result?.ok && result?.reason === "content-script-unavailable") {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
    setTimeout(async () => {
      await chrome.action.setBadgeText({ text: "" });
    }, 1500);
  }

  return result;
}

async function openEditorPanel() {
  const result = await sendToActiveTab({ type: "OPEN_EDITOR_PANEL" });
  return result;
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultSettings();

  chrome.contextMenus.create({
    id: "zhuyin-correct-selection",
    title: "注音校正：校正目前輸入欄位",
    contexts: ["editable"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "zhuyin-correct-selection") {
    await runCorrection();
  }
});

chrome.action.onClicked.addListener(async () => {
  await openEditorPanel();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "correct-current-field") {
    await runCorrection();
    return;
  }

  if (command === "open-editor-panel") {
    await openEditorPanel();
  }
});

