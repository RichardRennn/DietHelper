"use strict";

let currentFilter = null;
let isChatLoading = false;

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("historyGrid")) return;

  setTodayAsFilterDefault();
  renderDashboard();
  initDashboardControls();
  initDietChat();
});

function setTodayAsFilterDefault() {
  const filterInput = document.getElementById("filterDate");
  if (filterInput) filterInput.value = todayKey();
}

function renderDashboard() {
  updateStats();
  renderHistory();
}

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

function renderHistory() {
  const grid = document.getElementById("historyGrid");
  const emptyEl = document.getElementById("emptyState");
  if (!grid) return;

  let entries = loadData();
  if (currentFilter) entries = entries.filter(entry => entry.date === currentFilter);

  if (entries.length === 0) {
    grid.innerHTML = "";
    showEl(emptyEl);
    return;
  }

  hideEl(emptyEl);
  grid.innerHTML = entries.map((entry, idx) => buildCard(entry, idx)).join("");

  grid.querySelectorAll(".btn-delete-entry").forEach(btn => {
    btn.addEventListener("click", () => {
      const ts = parseInt(btn.dataset.ts, 10);
      deleteEntry(ts);
      renderDashboard();
    });
  });
}

function buildCard(entry, idx) {
  const calRange = entry.calMin === entry.calMax
    ? entry.calMin.toLocaleString("id-ID")
    : `${entry.calMin.toLocaleString("id-ID")}-${entry.calMax.toLocaleString("id-ID")}`;

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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
}

function initDietChat() {
  const form = document.getElementById("aiChatForm");
  const input = document.getElementById("aiChatInput");

  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const question = input?.value.trim();
    if (!question || isChatLoading) return;
    await submitDietQuestion(question);
  });

  document.querySelectorAll(".chat-suggestion-chip").forEach(chip => {
    chip.addEventListener("click", async () => {
      const question = chip.dataset.question?.trim();
      if (!question || isChatLoading) return;
      if (input) input.value = question;
      await submitDietQuestion(question);
    });
  });
}

async function submitDietQuestion(question) {
  const apiKey = getApiKey();
  if (!apiKey) {
    appendChatMessage("assistant", "Masukkan API Key Gemini di halaman Analisis terlebih dahulu agar saya bisa menjawab pertanyaanmu.");
    updateChatStatus("API key belum tersedia");
    return;
  }

  appendChatMessage("user", question);

  const input = document.getElementById("aiChatInput");
  if (input) input.value = "";

  setChatLoading(true);
  updateChatStatus("AI sedang berpikir...");

  try {
    const answer = await getDietChatResponse(question, apiKey);
    appendChatMessage("assistant", answer);
    updateChatStatus("Jawaban siap");
  } catch (err) {
    appendChatMessage("assistant", `Maaf, saya belum bisa menjawab sekarang. ${err.message}`);
    updateChatStatus("Terjadi kendala");
  } finally {
    setChatLoading(false);
  }
}

function appendChatMessage(role, text) {
  const container = document.getElementById("aiChatMessages");
  if (!container) return;

  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

function setChatLoading(on) {
  isChatLoading = on;

  const loadingEl = document.getElementById("aiChatLoading");
  const input = document.getElementById("aiChatInput");
  const sendBtn = document.getElementById("sendChatBtn");

  on ? showEl(loadingEl) : hideEl(loadingEl);
  if (input) input.disabled = on;
  if (sendBtn) sendBtn.disabled = on;
}

function updateChatStatus(text) {
  const status = document.getElementById("aiChatStatus");
  if (status) status.textContent = text;
}

async function getDietChatResponse(question, apiKey) {
  const today = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
  const entries = loadData().filter(entry => entry.date === todayKey());
  const { total, count } = calculateCalories(todayKey());
  const foods = entries.length
    ? entries.map(entry => `${entry.foodName} (${entry.calMin}-${entry.calMax} kcal)`).join(", ")
    : "belum ada data makanan yang disimpan hari ini";

  const prompt = `Anda adalah chatbot asisten diet dan kebugaran. Jawab selalu dalam Bahasa Indonesia dengan gaya ramah, praktis, dan aman.

Konteks pengguna hari ini:
- Tanggal: ${today}
- Total estimasi kalori: ${total} kcal
- Jumlah makanan tersimpan: ${count}
- Daftar makanan: ${foods}
- Target kalori harian: ${DAILY_TARGET} kcal

Aturan jawaban:
- Fokus menjawab pertanyaan pengguna tentang diet, makanan, camilan, pola makan, hidrasi, dan rekomendasi olahraga ringan-sedang.
- Gunakan data harian pengguna bila relevan.
- Beri jawaban ringkas tapi berguna, maksimal sekitar 6 kalimat.
- Jika pertanyaan menyangkut kondisi medis serius, alergi berat, atau cedera, sarankan konsultasi profesional.
- Jangan mengaku melihat data selain yang diberikan di atas.

Pertanyaan pengguna:
${question}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 450,
        temperature: 0.7
      }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API Error: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
         "Saya belum bisa memberikan jawaban saat ini.";
}
