import { generateKey, rateDigest } from "./keygen.js";
import { getState, update, subscribe } from "./state.js";

const POINTS_PER_KEY = 10;

const FUNNY = [
  "Этот ключ уже был. Очков не дам.",
  "Повтор. Красиво, но нет.",
  "Такой уже приносили. Очков — ноль.",
  "Эхо! Ключ-то тот же.",
  "Дежавю. Очков ноль, уважение — плюс.",
  "Хитрая попытка. Не считается.",
  "Плагиат. Смешно, но нет.",
  "Старый знакомый. Мимо.",
  "Секрет тот же — ключ тот же. Мимо.",
  "Очков за жадность не дают.",
];

let busy = false;

function streakBonus(streak) {
  return Math.min(10, Math.max(0, streak - 1));
}

export function initRoulette(root) {
  const genEl     = root.querySelector("#spin");
  const resultEl  = root.querySelector("#roulette-result");
  const historyEl = root.querySelector("#keygen-history");

  function renderHistory() {
    const items = (getState().history || []).slice().reverse().slice(0, 20);
    historyEl.innerHTML = items.length
      ? items.map((h) => `
          <div class="keygen-history__item">
            <code>${h.key}</code>
            <span>${h.hwid}</span>
          </div>`).join("")
      : `<div class="keygen-history__empty">пока пусто — придумай секрет и жми</div>`;
  }

  function showError(message) {
    resultEl.hidden = false;
    resultEl.className = "result is-lose";
    resultEl.innerHTML = `
      <div class="result__verdict">ОШИБКА</div>
      <div class="result__line">${message}</div>
    `;
  }

  async function generate() {
    if (busy) return;

    const state = getState();
    const hwid = (state.hwid || "").trim();
    const secret = (state.secret || "").trim();

    if (!secret) return showError("придумай секретный ключ — это часть игры");
    if (!hwid) return showError("придумай HWID — тоже часть игры");

    busy = true;
    genEl.disabled = true;
    genEl.textContent = "Генерим…";

    try {
      const info = await generateKey(hwid, state.algo, "", secret);
      const history = state.history || [];
      const isRepeat = history.some((h) => h.key === info.key);

      if (isRepeat) {
        update({ lastKey: info, streak: 0 });
        resultEl.hidden = false;
        resultEl.className = "result is-lose";
        resultEl.innerHTML = `
          <div class="result__verdict">ПОВТОР</div>
          <div class="result__line">${FUNNY[Math.floor(Math.random() * FUNNY.length)]}</div>
          <div class="result__line"><span>ключ</span><code>${info.key}</code></div>
          <div class="result__line"><span>серия сброшена</span><b>0</b></div>
        `;
      } else {
        const rating = rateDigest(info.digest);
        const newStreak = (state.streak || 0) + 1;
        const sBonus = streakBonus(newStreak);
        const gained = POINTS_PER_KEY + rating.bonus + sBonus;
        const newScore = (state.score || 0) + gained;
        const newHistory = [...history, {
          key: info.key, hwid, algo: info.algo, ts: Date.now(), tier: rating.tier,
        }];

        update({ lastKey: info, score: newScore, history: newHistory, streak: newStreak });

        const featuresHtml = rating.features.length
          ? `<div class="result__line"><span>особенности</span>${rating.features
              .map((f) => `<b>${f.label}</b>`).join(", ")}</div>`
          : "";

        const breakdown = [
          `<span>база</span><b>+${POINTS_PER_KEY}</b>`,
          rating.bonus ? `<span>редкость</span><b class="up">+${rating.bonus}</b>` : "",
          sBonus       ? `<span>серия</span><b class="up">+${sBonus}</b>` : "",
          `<span>итого</span><b class="up">+${gained}</b>`,
        ].filter(Boolean).join(" ");

        resultEl.hidden = false;
        resultEl.className = `result is-win tier-${rating.tier}`;
        resultEl.innerHTML = `
          <div class="result__verdict">НОВЫЙ КЛЮЧ · ${rating.title}</div>
          <div class="result__line"><span>ключ</span><code>${info.key}</code></div>
          ${featuresHtml}
          <div class="result__line">${breakdown}</div>
          <div class="result__line">
            <span>серия</span><b>${newStreak}</b>
            <span>очков всего</span><b>${newScore}</b>
            <span>ключей</span><b>${newHistory.length}</b>
          </div>
        `;
      }
    } catch (error) {
      showError(error.message);
    } finally {
      busy = false;
      genEl.disabled = false;
      genEl.textContent = "Сгенерировать ключ";
      renderHistory();
    }
  }

  genEl.addEventListener("click", generate);
  subscribe(renderHistory);
  renderHistory();
}