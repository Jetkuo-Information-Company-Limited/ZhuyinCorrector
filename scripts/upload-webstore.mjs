import fs from "node:fs/promises";
import path from "node:path";

function readEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少環境變數: ${name}`);
  }
  return value;
}

async function getAccessToken() {
  const clientId = readEnv("CWS_CLIENT_ID");
  const clientSecret = readEnv("CWS_CLIENT_SECRET");
  const refreshToken = readEnv("CWS_REFRESH_TOKEN");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`取得 access_token 失敗: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function uploadPackage(zipPath, accessToken, extensionId) {
  const zipBuffer = await fs.readFile(zipPath);
  const uploadUrl = `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${extensionId}`;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-goog-api-version": "2",
      "Content-Type": "application/zip"
    },
    body: zipBuffer
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`上傳失敗: ${JSON.stringify(data)}`);
  }

  return data;
}

async function publishPackage(accessToken, extensionId) {
  const publishUrl = `https://www.googleapis.com/chromewebstore/v1.1/items/${extensionId}/publish?publishTarget=default`;
  const response = await fetch(publishUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-goog-api-version": "2"
    }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`發佈失敗: ${JSON.stringify(data)}`);
  }

  return data;
}

async function main() {
  const zipPath = process.argv[2];
  const shouldPublish = process.argv.includes("--publish");

  if (!zipPath) {
    throw new Error("請提供 zip 路徑，例如: node scripts/upload-webstore.mjs dist\\zhuyin-phonetic-corrector.zip");
  }

  const resolvedZipPath = path.resolve(zipPath);
  const extensionId = readEnv("CWS_EXTENSION_ID");

  console.log(`[CWS] 準備上傳: ${resolvedZipPath}`);
  const accessToken = await getAccessToken();
  const uploadResult = await uploadPackage(resolvedZipPath, accessToken, extensionId);
  console.log("[CWS] 上傳結果:", JSON.stringify(uploadResult));

  if (shouldPublish) {
    const publishResult = await publishPackage(accessToken, extensionId);
    console.log("[CWS] 發佈結果:", JSON.stringify(publishResult));
  } else {
    console.log("[CWS] 已略過發佈（可加上 --publish）");
  }
}

main().catch((error) => {
  console.error("[CWS] 失敗:", error.message);
  process.exit(1);
});
