/* ============================================================
   AI DIET ASSISTANT — script.js
   Core logic: Camera, Image Upload, AI Vision & Text Analysis
   ============================================================ */

"use strict";

// ── Constants ──────────────────────────────────────────────
const STORAGE_KEY   = "aiDiet_history";
const APIKEY_STORE  = "aiDiet_apiKey";
const DAILY_TARGET  = 2000; // kcal reference

// ── State ──────────────────────────────────────────────────
let capturedImageBase64 = null;   // base64 (data URL) of captured image
let lastAnalysisResult  = null;   // holds the most recent AI result
let cameraStream        = null;   // active MediaStream

// ── DOM refs (index.html) ──────────────────────────────────
const $ = id => document.getElementById(id);

// ── Utility ────────────────────────────────────────────────
function showEl(el)  { if (el) el.hidden = false; }
function hideEl(el)  { if (el) el.hidden = true; }
function removeEl(el){ if (el) el.remove(); }

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" });
}

function todayKey() {
  return new Date().toISOString().split("T")[0];   // "YYYY-MM-DD"
}

// ── API Key Management ─────────────────────────────────────
function getApiKey() {
  return localStorage.getItem(APIKEY_STORE) || "";
}

function initApiKeyUI() {
  const card   = $("apikeyCard");
  const input  = $("apiKeyInput");
  const saveBtn= $("saveKeyBtn");
  if (!card) return;

  const stored = getApiKey();
  if (stored) {
    input.value = stored;
    card.classList.add("apikey-saved");
    saveBtn.textContent = "✓ Tersimpan";
  }

  saveBtn.addEventListener("click", () => {
    const key = input.value.trim();
    if (!key) { alert("Masukkan API Key terlebih dahulu."); return; }
    localStorage.setItem(APIKEY_STORE, key);
    card.classList.add("apikey-saved");
    saveBtn.textContent = "✓ Tersimpan";
    saveBtn.style.background = "var(--green-600)";
    setTimeout(() => saveBtn.style.background = "", 1500);
  });
}

// ── Camera ─────────────────────────────────────────────────
function initCamera() {
  const openBtn   = $("openCameraBtn");
  const modal     = $("cameraModal");
  const closeBtn  = $("closeCameraBtn");
  const overlay   = $("cameraOverlay");
  const video     = $("cameraVideo");
  const shutter   = $("shutterBtn");
  const canvas    = $("cameraCanvas");
  const permErr   = $("permissionError");
  const dismissErr= $("dismissPermError");
  if (!openBtn) return;

  openBtn.addEventListener("click", async () => {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      });
      video.srcObject = cameraStream;
      modal.classList.add("active");
    } catch (err) {
      console.error("Camera error:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        showEl(permErr);
      } else {
        alert("Kamera tidak tersedia di perangkat ini: " + err.message);
      }
    }
  });

  function closeCamera() {
    modal.classList.remove("active");
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      cameraStream = null;
    }
    video.srcObject = null;
  }

  closeBtn.addEventListener("click", closeCamera);
  overlay.addEventListener("click", closeCamera);

  shutter.addEventListener("click", () => {
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedImageBase64 = canvas.toDataURL("image/jpeg", 0.88);
    closeCamera();
    displayPreview(capturedImageBase64);
  });

  dismissErr.addEventListener("click", () => hideEl(permErr));
}

// ── File Upload ────────────────────────────────────────────
function initUpload() {
  const uploadBtn = $("uploadBtn");
  const fileInput = $("fileInput");
  if (!uploadBtn) return;

  uploadBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      capturedImageBase64 = e.target.result;
      displayPreview(capturedImageBase64);
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
  });
}

// ── Preview ────────────────────────────────────────────────
function displayPreview(dataUrl) {
  const section  = $("analysisSection");
  const imgEl    = $("previewImage");
  const resultCard = $("resultCard");
  const errEl    = $("analysisError");
  const saveSucc = $("saveSuccess");

  imgEl.src = dataUrl;
  showEl(section);
  hideEl(resultCard);
  hideEl(errEl);
  hideEl(saveSucc);
  lastAnalysisResult = null;

  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Retake ─────────────────────────────────────────────────
function initRetake() {
  const retakeBtn = $("retakeBtn");
  if (!retakeBtn) return;
  retakeBtn.addEventListener("click", () => {
    capturedImageBase64 = null;
    hideEl($("analysisSection"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// ── AI Analysis ────────────────────────────────────────────
function initAnalysis() {
  const analyzeBtn = $("analyzeBtn");
  if (!analyzeBtn) return;

  analyzeBtn.addEventListener("click", async () => {
    if (!capturedImageBase64) { alert("Ambil atau upload gambar terlebih dahulu."); return; }
    const apiKey = getApiKey();
    if (!apiKey) { alert("Masukkan API Key OpenRouter terlebih dahulu di bagian atas halaman."); return; }

    setAnalyzeLoading(true);
    hideEl($("resultCard"));
    hideEl($("analysisError"));

    try {
      const result = await analyzeFood(capturedImageBase64, apiKey);
      lastAnalysisResult = result;
      renderResult(result);
    } catch (err) {
      console.error("Analysis error:", err);
      showAnalysisError(err.message || "Terjadi kesalahan tidak diketahui.");
    } finally {
      setAnalyzeLoading(false);
    }
  });

  $("retryBtn")?.addEventListener("click", () => {
    hideEl($("analysisError"));
    $("analyzeBtn")?.click();
  });
}

function setAnalyzeLoading(on) {
  const btn   = $("analyzeBtn");
  const text  = btn?.querySelector(".analyze-text");
  const load  = btn?.querySelector(".analyze-loading");
  if (!btn) return;
  btn.disabled = on;
  on ? (showEl(load), hideEl(text)) : (hideEl(load), showEl(text));
}

// ── OpenRouter API call — Vision ──────────────────────────
async function analyzeFood(dataUrl, apiKey) {
  const systemPrompt = `Anda adalah asisten diet AI yang ahli mengenali makanan dari gambar dan menghitung estimasi kalori. Selalu jawab dalam Bahasa Indonesia. 
Kembalikan HANYA JSON valid (tanpa markdown/backtick) dengan format persis berikut:
{
  "foodName": "Nama makanan dalam Bahasa Indonesia",
  "emoji": "emoji yang merepresentasikan makanan",
  "calMin": <angka minimum kalori integer>,
  "calMax": <angka maksimum kalori integer>,
  "dietAdvice": "Saran diet singkat 2-3 kalimat berdasarkan kandungan kalori makanan ini. Sertakan saran alternatif yang lebih sehat bila relevan.",
  "confidence": "tinggi|sedang|rendah"
}
Jika gambar tidak menunjukkan makanan, set foodName ke "Bukan Makanan" dan calMin/calMax ke 0.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "AI Diet Assistant"
    },
    body: JSON.stringify({
      model: "openrouter/free", // ✅ Otomatis diarahkan ke model Vision gratis yang sedang aktif
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl }   // OpenRouter terima data URL langsung
            },
            {
              type: "text",
              text: "Analisis makanan dalam gambar ini. Berikan nama makanan, estimasi kalori (min-max), dan saran diet dalam format JSON."
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const msg = errData?.error?.message || `HTTP ${response.status}`;
    throw new Error(`OpenRouter API Error: ${msg}`);
  }

  const data = await response.json();
  // OpenRouter pakai format OpenAI: choices[0].message.content
  const rawText = data.choices?.[0]?.message?.content?.trim() || "";

  // Bersihkan markdown fences jika ada
  const clean = rawText.replace(/```json|```/gi, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("AI mengembalikan format tidak valid. Coba lagi.");
  }

  // Validasi
  if (!parsed.foodName) throw new Error("Respons AI tidak lengkap.");
  parsed.calMin = parseInt(parsed.calMin) || 0;
  parsed.calMax = parseInt(parsed.calMax) || 0;
  if (parsed.calMin > parsed.calMax) [parsed.calMin, parsed.calMax] = [parsed.calMax, parsed.calMin];

  return parsed;
}

// ── Render Result ──────────────────────────────────────────
function renderResult(result) {
  const card = $("resultCard");
  showEl(card);

  $("foodEmoji").textContent  = result.emoji || "🍽️";
  $("foodName").textContent   = result.foodName;
  $("calMin").textContent     = result.calMin.toLocaleString("id-ID");
  $("calMax").textContent     = result.calMax.toLocaleString("id-ID");
  $("dietAdvice").textContent = result.dietAdvice;

  // Animate calorie bar (relative to DAILY_TARGET)
  const avgCal = (result.calMin + result.calMax) / 2;
  const pct    = Math.min((avgCal / DAILY_TARGET) * 100, 100);
  requestAnimationFrame(() => {
    $("caloriesBar").style.width = pct + "%";
  });

  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── Show Error ─────────────────────────────────────────────
function showAnalysisError(msg) {
  const errEl = $("analysisError");
  const msgEl = $("analysisErrorMsg");
  if (msgEl) msgEl.textContent = msg;
  showEl(errEl);
}

// ── Save to Dashboard ──────────────────────────────────────
function initSave() {
  const saveBtn = $("saveBtn");
  if (!saveBtn) return;

  saveBtn.addEventListener("click", () => {
    if (!lastAnalysisResult || !capturedImageBase64) {
      alert("Tidak ada hasil analisis untuk disimpan.");
      return;
    }
    saveEntry({
      image:    capturedImageBase64,
      foodName: lastAnalysisResult.foodName,
      emoji:    lastAnalysisResult.emoji || "🍽️",
      calMin:   lastAnalysisResult.calMin,
      calMax:   lastAnalysisResult.calMax,
      advice:   lastAnalysisResult.dietAdvice,
      date:     todayKey(),
      timestamp: Date.now()
    });

    const successEl = $("saveSuccess");
    showEl(successEl);
    setTimeout(() => hideEl(successEl), 3000);
  });
}

// ── localStorage helpers ───────────────────────────────────
function loadData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function saveData(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function saveEntry(entry) {
  const entries = loadData();
  entries.unshift(entry);               // newest first
  saveData(entries);
}

function deleteEntry(timestamp) {
  const entries = loadData().filter(e => e.timestamp !== timestamp);
  saveData(entries);
}

function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
}

function calculateCalories(dateKey) {
  const entries = loadData().filter(e => e.date === dateKey);
  const total   = entries.reduce((sum, e) => sum + Math.round((e.calMin + e.calMax) / 2), 0);
  return { total, count: entries.length };
}

// ── Boot index.html ────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  if ($("openCameraBtn")) {
    initApiKeyUI();
    initCamera();
    initUpload();
    initRetake();
    initAnalysis();
    initSave();
  }
});