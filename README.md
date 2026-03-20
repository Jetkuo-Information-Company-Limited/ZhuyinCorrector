# 注音校正編輯器（Chrome Extension）

這是一個可直接載入 Chrome 的 Manifest V3 插件起始專案，目標是提供「注音輸入內容校正」能力，並可透過設定頁擴充自訂規則。

## 已初始化內容

- `manifest.json`: Chrome 擴充功能設定（MV3）
- `src/background.js`: 背景服務（點擊工具列圖示、快捷鍵、右鍵選單）
- `src/content-script.js`: 操作目前網頁輸入欄位並執行校正
- `src/zhuyin-corrector.js`: 注音校正核心邏輯（規則替換）
- `panel-src/*`: React 面板原始碼（JSX / CSS）
- `panel/*`: React 打包輸出與靜態圖示（HTML / JS / CSS / icons）
- `tests/*`: 單元測試骨架（Vitest）
- `build-all.bat`: 一鍵安裝依賴、執行測試、打包 zip、可選上傳 CWS
- `scripts/upload-webstore.mjs`: Chrome Web Store API 上傳與發佈腳本

## 快速開始

1. 打開 Chrome，進入 `chrome://extensions/`
2. 開啟右上角「開發人員模式」
3. 點「載入未封裝項目」
4. 選擇本專案資料夾：`e:\02_MyProjects\ZhuyinPhoneticCorrector`

## 打包與上傳

### 1) 安裝依賴

```bash
npm install
```

### 2) 執行單元測試

```bash
npm test
```

### 2.5) 單獨建置 React panel

```bash
npm run build:panel
```

### 3) 一鍵打包（產生 zip）

```bat
build-all.bat
```

輸出檔案：

- `dist/zhuyin-phonetic-corrector.zip`

### 4) （可選）一鍵上傳 Chrome Web Store

先設定環境變數（可參考 `webstore.env.example`）：

- `CWS_EXTENSION_ID`
- `CWS_CLIENT_ID`
- `CWS_CLIENT_SECRET`
- `CWS_REFRESH_TOKEN`
- `CWS_UPLOAD=1`（啟用上傳）
- `CWS_PUBLISH=1`（上傳後直接發佈；不設則只上傳）

接著執行：

```bat
build-all.bat
```

## 使用方式

- **立即校正**
  - 在網頁中先點選輸入框（`input` / `textarea` / `contenteditable`）
  - 點插件圖示開啟右側面板後，按「校正面板文字」
- **右側編輯器面板**
  - 點插件圖示會直接在當前頁面右側開啟編輯器面板（無 popup）
  - 可在面板內「載入目前欄位」、「校正面板文字」、「套用到目前欄位」
- **快捷鍵**
  - 預設 `Alt + Shift + Z`
  - 開啟面板：`Alt + Shift + E`
- **右鍵選單**
  - 在可編輯區塊點右鍵，選「注音校正：校正目前輸入欄位」

## 後續建議

- 將目前字串替換規則升級為「詞典 + 分詞」或「拼音/注音語言模型」
- 加入黑白名單站點設定（避免在密碼欄等敏感欄位處理）
- 補上更多測試（規則優先順序、衝突、長文本效能）

## 來源與授權聲明

- 本專案部分內容延伸自 `panel/NOTICE.txt` 所標示之來源專案與規格（Bopomofo IVS Font Specification／注音 IVS 字型規格）。
- 相關著作權與授權條款請參閱 `panel/NOTICE.txt`（Apache License 2.0）。

## 第三方圖示

- `panel/icons/maximize-2.svg`、`panel/icons/minimize-2.svg`、`panel/icons/x.svg` 來自 Feather Icons（MIT License）

## License
This project is licensed under the Apache License 2.0.