const { app, BrowserWindow, ipcMain, safeStorage, shell } = require("electron");
const path = require("path");
const Store = require("electron-store");

const store = new Store({
  name: "open-teleprompter",
  defaults: {
    setupComplete: false,
    preferredProvider: "anthropic",
    hasApiKey: false,
  },
});

/** API key kept only as an encrypted buffer when safeStorage is available. */
const KEY_ENC = "apiKeyEncrypted";
const KEY_PLAIN_FALLBACK = "apiKeyPlainFallback"; // only if safeStorage unavailable

function setApiKey(plain) {
  if (!plain || !String(plain).trim()) {
    store.delete(KEY_ENC);
    store.delete(KEY_PLAIN_FALLBACK);
    store.set("hasApiKey", false);
    return { ok: true };
  }
  const value = String(plain).trim();
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(value);
      store.set(KEY_ENC, buf.toString("base64"));
      store.delete(KEY_PLAIN_FALLBACK);
    } else {
      // Dev / rare OS: still local-only, warn in UI
      store.set(KEY_PLAIN_FALLBACK, value);
      store.delete(KEY_ENC);
    }
    store.set("hasApiKey", true);
    return { ok: true, encrypted: safeStorage.isEncryptionAvailable() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function getApiKey() {
  try {
    const enc = store.get(KEY_ENC);
    if (enc && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(enc, "base64"));
    }
    return store.get(KEY_PLAIN_FALLBACK) || "";
  } catch {
    return "";
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 420,
    minHeight: 480,
    title: "Open Teleprompter",
    backgroundColor: "#111214",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// --- IPC: settings (never leave the machine except AI calls the user initiates) ---

ipcMain.handle("settings:get", () => {
  return {
    setupComplete: store.get("setupComplete"),
    preferredProvider: store.get("preferredProvider") || "anthropic",
    hasApiKey: Boolean(store.get("hasApiKey") && getApiKey()),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    appVersion: app.getVersion(),
  };
});

ipcMain.handle("settings:completeSetup", (_e, payload = {}) => {
  if (payload.apiKey) setApiKey(payload.apiKey);
  if (payload.preferredProvider) {
    store.set("preferredProvider", payload.preferredProvider);
  }
  store.set("setupComplete", true);
  return {
    setupComplete: true,
    hasApiKey: Boolean(getApiKey()),
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
  };
});

ipcMain.handle("settings:setApiKey", (_e, apiKey) => setApiKey(apiKey));

ipcMain.handle("settings:clearApiKey", () => {
  setApiKey("");
  return { ok: true };
});

ipcMain.handle("settings:skipWizard", () => {
  store.set("setupComplete", true);
  return { setupComplete: true, hasApiKey: Boolean(getApiKey()) };
});

/**
 * Optional AI format. Key is read only in main process and sent straight to
 * the provider — never to RiseDrivers servers.
 */
ipcMain.handle("ai:formatScript", async (_e, { rawText, keepDirections }) => {
  const key = getApiKey();
  if (!key) {
    return {
      ok: false,
      error: "No API key set. Open Settings to add your Anthropic key, or use Format (local).",
    };
  }
  if (!rawText || !String(rawText).trim()) {
    return { ok: false, error: "Script is empty." };
  }

  const system = `You are a professional teleprompter script editor. Reformat the user's raw script for on-screen teleprompter reading.

Rules:
- Break dialogue/narration into short phrase-based lines, roughly 5-10 words each, at natural breath/phrase boundaries.
- Detect speaker names (e.g. lines in ALL CAPS, or "NAME:" prefixes) and emit them as their own "speaker" entries (label only, no colon).
- Insert "pause" entries (1-2 seconds) at paragraph breaks, scene changes, or after emphatic lines.
- ${
    keepDirections
      ? "Keep stage/camera directions (parentheticals, bracketed notes) as their own \"direction\" entries."
      : "Omit stage/camera directions entirely."
  }
- Preserve the original wording exactly; do not summarize, add, or invent content.
- Output ONLY a raw JSON array (no markdown fences, no commentary), where each item is one of:
  {"type":"speaker","text":"NAME"}
  {"type":"line","text":"short phrase"}
  {"type":"pause","seconds":1.5}
  {"type":"direction","text":"stage direction text"}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: String(rawText).slice(0, 100_000) }],
      }),
    });

    if (!resp.ok) {
      let detail = `Provider error (${resp.status})`;
      try {
        const j = await resp.json();
        if (j?.error?.message) detail = j.error.message;
      } catch {
        /* ignore */
      }
      return { ok: false, error: detail };
    }

    const data = await resp.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message || "Network error calling AI provider." };
  }
});
