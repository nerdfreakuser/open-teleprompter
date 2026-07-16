/* Open Teleprompter - renderer (no Node). IPC via window.teleprompter */

const ACCENT = "#9CFF6E";
const BASE_PX_PER_SEC = 35;
const WPM = 140;
const SCRIPT_KEY = "rd-tele-script-v1";

const $ = (id) => document.getElementById(id);

/** @typedef {{ type: 'speaker'|'line'|'pause'|'direction', text: string, seconds?: number }} ScriptLine */

// - - Script helpers - - 
function countWords(text) {
  const t = (text || "").trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}
function fmtTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
function splitPhrases(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += 8) {
    chunks.push({ type: "line", text: words.slice(i, i + 8).join(" ") });
  }
  return chunks;
}
function processScriptLocal(raw, keepDirections) {
  const out = [];
  const paragraphs = raw.replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const para of paragraphs) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    for (const line of lines) {
      const dirOnly = line.match(/^[\(\[](.+)[\)\]]$/);
      if (dirOnly) {
        if (keepDirections) out.push({ type: "direction", text: dirOnly[1].trim() });
        continue;
      }
      const speakerMatch = line.match(/^([A-Z][A-Z0-9 .'\-]{0,28}):\s*(.*)$/);
      if (speakerMatch) {
        out.push({ type: "speaker", text: speakerMatch[1].trim() });
        if (speakerMatch[2].trim()) out.push(...splitPhrases(speakerMatch[2].trim()));
        continue;
      }
      if (
        line.length <= 28 &&
        /^[A-Z0-9 .'\-]+$/.test(line) &&
        /[A-Z]/.test(line) &&
        line.split(/\s+/).length <= 4
      ) {
        out.push({ type: "speaker", text: line });
        continue;
      }
      if (!keepDirections) {
        const working = line
          .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        out.push(...splitPhrases(working));
      } else {
        const parts = line.split(/(\([^)]*\)|\[[^\]]*\])/g);
        for (const p of parts) {
          if (!p.trim()) continue;
          if (/^[\(\[]/.test(p)) {
            out.push({
              type: "direction",
              text: p.replace(/^[\(\[]|[\)\]]$/g, "").trim(),
            });
          } else {
            out.push(...splitPhrases(p.trim()));
          }
        }
      }
    }
    out.push({ type: "pause", text: "···", seconds: 1.2 });
  }
  while (out.length && out[out.length - 1].type === "pause") out.pop();
  if (!out.length) {
    return raw
      .split(/\n+/)
      .filter(Boolean)
      .map((t) => ({ type: "line", text: t.trim() }));
  }
  return out;
}

function parseAIResponse(resp, fallbackText) {
  let jsonStr = (resp || "").trim();
  const fence = jsonStr.match(/```(?:json)?([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();
  let arr = null;
  try {
    arr = JSON.parse(jsonStr);
  } catch {
    const m = jsonStr.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        arr = JSON.parse(m[0]);
      } catch {
        arr = null;
      }
    }
  }
  if (!Array.isArray(arr)) {
    return processScriptLocal(fallbackText || "", true);
  }
  return arr
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      type: ["speaker", "line", "pause", "direction"].includes(x.type)
        ? x.type
        : "line",
      text: typeof x.text === "string" ? x.text : "",
      seconds: typeof x.seconds === "number" ? x.seconds : 1,
    }));
}

// - - State - - 
const state = {
  mode: "script",
  rawText: "",
  fileName: "",
  keepDirections: true,
  lines: /** @type {ScriptLine[]} */ ([]),
  speed: 1,
  fontSize: 56,
  mirrored: false,
  playing: false,
  hasStartedOnce: false,
  countdown: null,
  progress: 0,
  timeRemainingSec: 0,
  hasApiKey: false,
};

const stageEl = () => $("stage");
let scrollAccum = 0;
let lastTs = null;
let rafId = null;
let countdownTimeout = null;
let lastProgressUpdate = 0;

// - - Persist script - - 
function loadScript() {
  try {
    const raw = localStorage.getItem(SCRIPT_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.rawText) state.rawText = d.rawText;
    if (d.lines) state.lines = d.lines;
    if (typeof d.keepDirections === "boolean") state.keepDirections = d.keepDirections;
    if (typeof d.speed === "number") state.speed = d.speed;
    if (typeof d.fontSize === "number") state.fontSize = d.fontSize;
  } catch {
    /* ignore */
  }
}
function saveScript() {
  try {
    localStorage.setItem(
      SCRIPT_KEY,
      JSON.stringify({
        rawText: state.rawText,
        lines: state.lines,
        keepDirections: state.keepDirections,
        speed: state.speed,
        fontSize: state.fontSize,
      }),
    );
  } catch {
    /* ignore */
  }
}

// - - Wizard - - 
let wizStep = 0;
function showWizard(show) {
  $("wizard").classList.toggle("hidden", !show);
  $("app").classList.toggle("hidden", show);
}
function renderWizard() {
  document.querySelectorAll(".wiz-pane").forEach((p) => {
    p.classList.toggle("hidden", Number(p.dataset.pane) !== wizStep);
  });
  document.querySelectorAll(".wiz-steps span").forEach((s) => {
    s.classList.toggle("on", Number(s.dataset.step) <= wizStep);
  });
  $("wiz-back").classList.toggle("hidden", wizStep === 0);
  $("wiz-skip").classList.toggle("hidden", wizStep === 2);
  $("wiz-next").textContent = wizStep === 2 ? "Start prompting" : "Continue";
  if (wizStep === 2) {
    const key = ($("wiz-key").value || "").trim();
    $("wiz-summary").textContent = key
      ? "AI Format enabled with your Anthropic key (stored on this device only)."
      : "Running without AI - use Format (local) or paste a ready-made script.";
  }
}

async function finishWizard(skipKey) {
  const apiKey = skipKey ? "" : ($("wiz-key").value || "").trim();
  if (window.teleprompter) {
    if (skipKey) await window.teleprompter.skipWizard();
    else await window.teleprompter.completeSetup({ apiKey, preferredProvider: "anthropic" });
    const s = await window.teleprompter.getSettings();
    state.hasApiKey = s.hasApiKey;
  }
  updateKeyBadge();
  showWizard(false);
  renderScriptUI();
}

// - - UI bind - - 
function updateKeyBadge() {
  const b = $("key-badge");
  if (state.hasApiKey) {
    b.textContent = "AI ready";
    b.classList.remove("warn");
  } else {
    b.textContent = "Local only";
    b.classList.add("warn");
  }
  $("btn-ai").disabled = !state.hasApiKey;
  $("btn-ai").title = state.hasApiKey
    ? "Format with your Anthropic key"
    : "Add an API key in Settings";
}

function renderPreview() {
  const el = $("preview");
  if (!state.lines.length) {
    el.innerHTML =
      '<p class="muted">Use <strong>Format (local)</strong> anytime. <strong>AI Format</strong> needs your key in Settings.</p>';
    return;
  }
  el.innerHTML = state.lines
    .map((l) => {
      if (l.type === "speaker") return `<div class="speaker">${escapeHtml(l.text)}</div>`;
      if (l.type === "direction")
        return `<div class="direction">${escapeHtml(l.text)}</div>`;
      if (l.type === "pause") return `<div class="pause">· · ·</div>`;
      return `<div class="line">${escapeHtml(l.text)}</div>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderStats() {
  const wc = countWords(state.rawText);
  const pauseTotal = state.lines
    .filter((l) => l.type === "pause")
    .reduce((a, l) => a + (l.seconds || 1), 0);
  const est = Math.round((wc / WPM) * 60 + pauseTotal);
  $("stats").textContent = `${wc} words · ~${fmtTime(est)} at ${WPM} wpm`;
}

function renderScriptUI() {
  $("raw").value = state.rawText;
  $("keep-dir").checked = state.keepDirections;
  $("file-name").textContent = state.fileName || "No file";
  $("speed").value = String(state.speed);
  $("speed-val").textContent = `${state.speed.toFixed(1)}x`;
  renderStats();
  renderPreview();
  updateKeyBadge();
}

function setMode(mode) {
  state.mode = mode;
  $("tab-script").classList.toggle("on", mode === "script");
  $("tab-prompter").classList.toggle("on", mode === "prompter");
  $("view-script").classList.toggle("hidden", mode !== "script");
  $("view-prompter").classList.toggle("hidden", mode !== "prompter");
  if (mode === "prompter") renderStage();
}

function stageStyle(l) {
  const fs = state.fontSize;
  if (l.type === "speaker")
    return `color:${ACCENT};font-weight:700;font-size:${Math.round(fs * 0.5)}px;letter-spacing:3px;text-transform:uppercase;text-align:center;margin:1.4em 0 0.4em;`;
  if (l.type === "direction")
    return `color:#7a7d81;font-style:italic;font-size:${Math.round(fs * 0.5)}px;text-align:center;margin-bottom:0.6em;`;
  if (l.type === "pause")
    return `height:${Math.round((l.seconds || 1) * 34)}px;display:flex;align-items:center;justify-content:center;color:#3a3d40;font-size:22px;letter-spacing:10px;`;
  return `color:#f2f2ee;font-weight:600;font-size:${fs}px;line-height:1.5;text-align:center;margin-bottom:0.5em;`;
}

function renderStage() {
  const stage = stageEl();
  const mirror = state.mirrored ? "transform:scaleY(-1);" : "";
  stage.style.cssText = mirror;
  const innerMirror = state.mirrored ? "transform:scaleY(-1);" : "";
  stage.innerHTML = `<div class="stage-inner" style="${innerMirror}">${state.lines
    .map(
      (l, i) =>
        `<div data-line-idx="${i}" style="${stageStyle(l)}">${
          l.type === "pause" ? "· · ·" : escapeHtml(l.text)
        }</div>`,
    )
    .join("")}</div>`;
  stage.scrollTop = 0;
  scrollAccum = 0;
  state.progress = 0;
  $("progress-fill").style.width = "0%";
  $("time-left").textContent = "0:00";
  $("btn-mirror").classList.toggle("on", state.mirrored);
  $("btn-play").textContent = state.playing ? "❚❚" : "▶";
}

// - - Playback - - 
function updateProgressNow() {
  const el = stageEl();
  if (!el) return;
  const maxScroll = el.scrollHeight - el.clientHeight;
  const p = maxScroll > 0 ? Math.min(1, el.scrollTop / maxScroll) : 0;
  const remaining =
    maxScroll > 0
      ? Math.max(0, maxScroll - el.scrollTop) / (BASE_PX_PER_SEC * state.speed)
      : 0;
  state.progress = p;
  state.timeRemainingSec = remaining;
  $("progress-fill").style.width = `${p * 100}%`;
  $("time-left").textContent = fmtTime(remaining);
}

function tick(ts) {
  if (!state.playing) {
    rafId = null;
    return;
  }
  if (lastTs == null) lastTs = ts;
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;
  const el = stageEl();
  if (el) {
    scrollAccum += BASE_PX_PER_SEC * state.speed * dt;
    el.scrollTop = scrollAccum;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const p = maxScroll > 0 ? Math.min(1, el.scrollTop / maxScroll) : 0;
    const remaining =
      maxScroll > 0
        ? Math.max(0, maxScroll - el.scrollTop) / (BASE_PX_PER_SEC * state.speed)
        : 0;
    if (p >= 1) {
      state.playing = false;
      state.progress = 1;
      state.timeRemainingSec = 0;
      $("progress-fill").style.width = "100%";
      $("time-left").textContent = "0:00";
      $("btn-play").textContent = "▶";
      rafId = null;
      return;
    }
    if (ts - lastProgressUpdate > 150) {
      lastProgressUpdate = ts;
      state.progress = p;
      state.timeRemainingSec = remaining;
      $("progress-fill").style.width = `${p * 100}%`;
      $("time-left").textContent = fmtTime(remaining);
    }
  }
  rafId = requestAnimationFrame(tick);
}

function setPlaying(on) {
  state.playing = on;
  $("btn-play").textContent = on ? "❚❚" : "▶";
  if (on) {
    lastTs = null;
    const el = stageEl();
    if (el) scrollAccum = el.scrollTop;
    rafId = requestAnimationFrame(tick);
  } else if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function startCountdown() {
  let n = 3;
  const cd = $("countdown");
  cd.classList.remove("hidden");
  cd.textContent = String(n);
  const step = () => {
    n -= 1;
    if (n <= 0) {
      cd.classList.add("hidden");
      state.hasStartedOnce = true;
      setPlaying(true);
    } else {
      cd.textContent = String(n);
      countdownTimeout = setTimeout(step, 1000);
    }
  };
  countdownTimeout = setTimeout(step, 1000);
}

function togglePlay() {
  if (state.playing) {
    setPlaying(false);
    return;
  }
  if (!state.hasStartedOnce) {
    startCountdown();
    return;
  }
  setPlaying(true);
}

function resetPrompter() {
  setPlaying(false);
  state.hasStartedOnce = false;
  if (countdownTimeout) clearTimeout(countdownTimeout);
  $("countdown").classList.add("hidden");
  const el = stageEl();
  if (el) el.scrollTop = 0;
  scrollAccum = 0;
  updateProgressNow();
}

function skip(dir) {
  const el = stageEl();
  if (!el) return;
  const nodes = Array.from(el.querySelectorAll("[data-line-idx]"));
  const elRect = el.getBoundingClientRect();
  const cur = el.scrollTop;
  const offsets = nodes.map(
    (n) => n.getBoundingClientRect().top - elRect.top + el.scrollTop,
  );
  let target;
  if (dir > 0) target = offsets.find((o) => o > cur + 5) ?? el.scrollHeight;
  else {
    const past = offsets.filter((o) => o < cur - 5);
    target = past.length ? past[past.length - 1] : 0;
  }
  el.scrollTo({ top: target, behavior: "smooth" });
  setTimeout(() => {
    scrollAccum = target;
    updateProgressNow();
  }, 350);
}

function openPrompter() {
  if (!state.lines.length && state.rawText.trim()) {
    state.lines = processScriptLocal(state.rawText, state.keepDirections);
    saveScript();
    renderPreview();
  }
  if (!state.lines.length) return;
  state.hasStartedOnce = false;
  setPlaying(false);
  setMode("prompter");
}

// - - Events - - 
function wire() {
  $("wiz-next").onclick = async () => {
    if (wizStep < 2) {
      wizStep += 1;
      renderWizard();
    } else {
      await finishWizard(false);
    }
  };
  $("wiz-back").onclick = () => {
    wizStep = Math.max(0, wizStep - 1);
    renderWizard();
  };
  $("wiz-skip").onclick = async () => {
    await finishWizard(true);
  };
  $("link-anthropic").onclick = (e) => {
    e.preventDefault();
    // open handled by setWindowOpenHandler if target blank - use shell via default
    window.open("https://console.anthropic.com/", "_blank");
  };

  $("tab-script").onclick = () => {
    setPlaying(false);
    setMode("script");
  };
  $("tab-prompter").onclick = () => openPrompter();
  $("btn-open-prompter").onclick = () => openPrompter();
  $("btn-back-script").onclick = () => {
    setPlaying(false);
    setMode("script");
  };

  $("raw").oninput = (e) => {
    state.rawText = e.target.value;
    renderStats();
    saveScript();
  };
  $("keep-dir").onchange = (e) => {
    state.keepDirections = e.target.checked;
    saveScript();
  };
  $("file").onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.rawText = String(ev.target.result || "");
      state.fileName = file.name;
      $("raw").value = state.rawText;
      $("file-name").textContent = file.name;
      renderStats();
      saveScript();
    };
    reader.readAsText(file);
  };

  $("btn-local").onclick = () => {
    $("format-error").classList.add("hidden");
    if (!state.rawText.trim()) return;
    state.lines = processScriptLocal(state.rawText, state.keepDirections);
    saveScript();
    renderPreview();
  };

  $("btn-ai").onclick = async () => {
    $("format-error").classList.add("hidden");
    if (!state.rawText.trim() || !window.teleprompter) return;
    $("btn-ai").disabled = true;
    $("btn-ai").textContent = "Working…";
    try {
      const res = await window.teleprompter.formatScriptAI({
        rawText: state.rawText,
        keepDirections: state.keepDirections,
      });
      if (!res.ok) throw new Error(res.error || "AI failed");
      state.lines = parseAIResponse(res.text, state.rawText);
      saveScript();
      renderPreview();
    } catch (err) {
      $("format-error").textContent = err.message || String(err);
      $("format-error").classList.remove("hidden");
    } finally {
      $("btn-ai").textContent = "AI Format";
      updateKeyBadge();
    }
  };

  $("btn-play").onclick = () => togglePlay();
  $("btn-reset").onclick = () => resetPrompter();
  $("speed").oninput = (e) => {
    state.speed = Number(e.target.value);
    $("speed-val").textContent = `${state.speed.toFixed(1)}x`;
    saveScript();
  };
  $("btn-font-down").onclick = () => {
    state.fontSize = Math.max(28, state.fontSize - 4);
    saveScript();
    renderStage();
  };
  $("btn-font-up").onclick = () => {
    state.fontSize = Math.min(120, state.fontSize + 4);
    saveScript();
    renderStage();
  };
  $("btn-mirror").onclick = () => {
    state.mirrored = !state.mirrored;
    renderStage();
  };
  $("btn-fs").onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  $("progress").onclick = (e) => {
    const el = stageEl();
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const maxScroll = el.scrollHeight - el.clientHeight;
    el.scrollTop = frac * maxScroll;
    scrollAccum = el.scrollTop;
    updateProgressNow();
  };
  stageEl()?.addEventListener("scroll", () => {
    if (!state.playing && stageEl()) {
      scrollAccum = stageEl().scrollTop;
      updateProgressNow();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (state.mode !== "prompter") return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
    } else if (e.code === "ArrowUp") {
      e.preventDefault();
      skip(-1);
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      skip(1);
    } else if (e.code === "ArrowRight") {
      state.speed = Math.min(3, Math.round((state.speed + 0.1) * 10) / 10);
      $("speed").value = String(state.speed);
      $("speed-val").textContent = `${state.speed.toFixed(1)}x`;
    } else if (e.code === "ArrowLeft") {
      state.speed = Math.max(0.2, Math.round((state.speed - 0.1) * 10) / 10);
      $("speed").value = String(state.speed);
      $("speed-val").textContent = `${state.speed.toFixed(1)}x`;
    }
  });

  // Settings
  $("btn-settings").onclick = () => {
    $("settings").classList.toggle("hidden");
    $("set-status").textContent = state.hasApiKey
      ? "A key is saved on this device."
      : "No key saved.";
  };
  $("set-close").onclick = () => $("settings").classList.add("hidden");
  $("set-save").onclick = async () => {
    if (!window.teleprompter) return;
    const key = $("set-key").value.trim();
    const r = await window.teleprompter.setApiKey(key);
    if (!r.ok) {
      $("set-status").textContent = r.error || "Could not save.";
      return;
    }
    state.hasApiKey = Boolean(key);
    $("set-key").value = "";
    $("set-status").textContent = key
      ? r.encrypted
        ? "Key saved (encrypted on this device)."
        : "Key saved locally (OS encryption unavailable)."
      : "Key cleared.";
    updateKeyBadge();
  };
  $("set-clear").onclick = async () => {
    if (!window.teleprompter) return;
    await window.teleprompter.clearApiKey();
    state.hasApiKey = false;
    $("set-key").value = "";
    $("set-status").textContent = "Key cleared.";
    updateKeyBadge();
  };
}

async function boot() {
  loadScript();
  wire();

  // Browser fallback for testing without Electron
  if (!window.teleprompter) {
    window.teleprompter = {
      getSettings: async () => ({
        setupComplete: localStorage.getItem("rd-tele-setup") === "1",
        hasApiKey: false,
        encryptionAvailable: false,
        appVersion: "web-dev",
      }),
      completeSetup: async () => {
        localStorage.setItem("rd-tele-setup", "1");
        return { setupComplete: true, hasApiKey: false };
      },
      skipWizard: async () => {
        localStorage.setItem("rd-tele-setup", "1");
        return { setupComplete: true, hasApiKey: false };
      },
      setApiKey: async () => ({ ok: false, error: "Electron only" }),
      clearApiKey: async () => ({ ok: true }),
      formatScriptAI: async () => ({
        ok: false,
        error: "AI requires the desktop app with your API key.",
      }),
    };
  }

  const settings = await window.teleprompter.getSettings();
  state.hasApiKey = settings.hasApiKey;
  $("set-version").textContent = `Version ${settings.appVersion || "1.0.0"}`;

  if (!settings.setupComplete) {
    showWizard(true);
    renderWizard();
  } else {
    showWizard(false);
    renderScriptUI();
  }
}

boot();
