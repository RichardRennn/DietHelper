
"use strict";

// ── State ──────────────────────────────────────────────────
let currentFilter = null;  // "YYYY-MM-DD" or null (all)

// ── Boot Dashboard ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("historyGrid")) return;

  setTodayAsFilterDefault();
  renderDashboard();
  initDashboardControls();
});

// ── Set today as default filter (but show all initially) ───
function setTodayAsFilterDefault() {
  const filterInput = document.getElementById("filterDate");
  if (filterInput) filterInput.value = todayKey();
  // Don't actually filter by default — show all entries
}

// ── Render the full dashboard ──────────────────────────────
function renderDashboard() {
  updateStats();
  renderHistory();
}

// ── Update stats row ───────────────────────────────────────
function updateStats() {
  const { total, count } = calculateCalories(todayKey());
  const allEntries = loadData();

  const calEl = document.getElementById("todayCalories");
  if (calEl) calEl.textContent = total.toLocaleString("id-ID");

  const mealEl = document.getElementById("todayMeals");
  if (mealEl) mealEl.textContent = count;

  const totEl = document.getElementById("totalEntries");
  if (totEl) totEl.textContent = allEntries.length;

  const pct = Math.min((total / DAILY_TARGET) * 100, 100);
  const bar = document.getElementById("calorieProgress");
  const lbl = document.getElementById("calorieProgressLabel");
  if (bar) requestAnimationFrame(() => { bar.style.width = pct + "%"; });
  if (lbl) lbl.textContent = `${Math.round(pct)}% dari target ${DAILY_TARGET.toLocaleString("id-ID")} kcal`;
}

// ── Render history list ────────────────────────────────────
function renderHistory() {
  const grid    = document.getElementById("historyGrid");
  const emptyEl = document.getElementById("emptyState");
  if (!grid) return;

  let entries = loadData();
  if (currentFilter) entries = entries.filter(e => e.date === currentFilter);

  if (entries.length === 0) {
    grid.innerHTML = "";
    showEl(emptyEl);
    return;
  }

  hideEl(emptyEl);
  grid.innerHTML = entries.map((e, i) => buildCard(e, i)).join("");

  grid.querySelectorAll(".btn-delete-entry").forEach(btn => {
    btn.addEventListener("click", () => {
      const ts = parseInt(btn.dataset.ts);
      deleteEntry(ts);
      renderDashboard();
    });
  });
}

function buildCard(entry, idx) {
  const calRange = entry.calMin === entry.calMax
    ? entry.calMin.toLocaleString("id-ID")
    : `${entry.calMin.toLocaleString("id-ID")}–${entry.calMax.toLocaleString("id-ID")}`;

  return `
  <div class="history-card" style="animation-delay:${idx * 60}ms">
    <img class="history-card-img" src="${entry.image}" alt="${escHtml(entry.foodName)}" loading="lazy" />
    <div class="history-card-body">
      <div class="history-card-date">📅 ${formatDate(entry.timestamp)}</div>
      <div class="history-card-name">${entry.emoji || "🍽️"} ${escHtml(entry.foodName)}</div>
      <div class="history-card-calories">🔥 ${calRange} kcal</div>
    </div>
    <div class="history-card-footer">
      <button class="btn-delete-entry" data-ts="${entry.timestamp}" title="Hapus entri ini">🗑️ Hapus</button>
    </div>
  </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Dashboard Controls ─────────────────────────────────────
function initDashboardControls() {
  const filterInput = document.getElementById("filterDate");
  filterInput?.addEventListener("change", () => {
    currentFilter = filterInput.value || null;
    renderHistory();
  });

  document.getElementById("clearFilterBtn")?.addEventListener("click", () => {
    currentFilter = null;
    if (filterInput) filterInput.value = "";
    renderHistory();
  });

  document.getElementById("clearAllBtn")?.addEventListener("click", () => {
    showEl(document.getElementById("confirmModal"));
  });

  document.getElementById("confirmDeleteBtn")?.addEventListener("click", () => {
    clearAllData();
    hideEl(document.getElementById("confirmModal"));
    renderDashboard();
  });

  document.getElementById("cancelDeleteBtn")?.addEventListener("click", () => {
    hideEl(document.getElementById("confirmModal"));
  });

  document.getElementById("refreshRecBtn")?.addEventListener("click", fetchAIRecommendation);
}

// ── AI Daily Recommendation ────────────────────────────────
async function fetchAIRecommendation() {
  const apiKey = getApiKey();
  if (!apiKey) {
    document.getElementById("aiRecText").textContent =
      "⚠️ Masukkan API Key OpenRouter di halaman Analisis untuk mendapatkan rekomendasi AI.";
    return;
  }

  const { total, count } = calculateCalories(todayKey());
  const loadEl     = document.getElementById("aiRecLoading");
  const textEl     = document.getElementById("aiRecText");
  const refreshBtn = document.getElementById("refreshRecBtn");

  showEl(loadEl);
  textEl.textContent = "";
  refreshBtn.disabled = true;

  try {
    const advice = await getDietRecommendation(total, count, apiKey);
    hideEl(loadEl);
    textEl.textContent = advice;
  } catch (err) {
    hideEl(loadEl);
    textEl.textContent = `⚠️ Gagal memuat rekomendasi: ${err.message}`;
  } finally {
    refreshBtn.disabled = false;
  }
}

// ── OpenRouter API call — Text ─────────────────────────────
async function getDietRecommendation(totalCalories, mealCount, apiKey) {
  const today   = new Date().toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long" });
  const entries = loadData().filter(e => e.date === todayKey());
  const foods   = entries.map(e => e.foodName).join(", ") || "belum ada";

  const prompt = `Hari ini ${today}, seseorang telah mengonsumsi ${mealCount} makanan dengan total estimasi kalori sekitar ${totalCalories} kcal.
Makanan yang dikonsumsi: ${foods}.
Target kalori harian adalah ${DAILY_TARGET} kcal.
Berikan saran diet singkat (3-4 kalimat) dalam Bahasa Indonesia yang personal, praktis, dan memotivasi berdasarkan data tersebut. Sertakan rekomendasi makanan berikutnya jika relevan.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "AI Diet Assistant"
    },
    body: JSON.stringify({
      model: "openrouter/free",
      max_tokens: 350,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  // OpenRouter menggunakan format OpenAI: choices[0].message.content
  return data.choices?.[0]?.message?.content?.trim() ||
         "Tidak dapat menghasilkan rekomendasi saat ini.";
}