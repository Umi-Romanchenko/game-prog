import { ALGORITHMS } from "./keygen.js";
import { getState, update, changeBalance, subscribe, load } from "./state.js";
import { initRoulette } from "./roulette.js";
import { initMines } from "./mines.js";
import { initChecksum } from "./checksum.js";
import { initChain } from "./chain.js";
import { initSafe } from "./safe.js";

const state = load();

const DISPLAY_ORDER = ["base32", "mod97", "hmac16", "token"];

const balanceValueEl  = document.querySelector("#balance-value");
const balanceResetEl  = document.querySelector("#balance-reset");
const hwidEl          = document.querySelector("#hwid");
const algoEl          = document.querySelector("#algo");
const algoNoteEl      = document.querySelector("#algo-note");
const secretEl        = document.querySelector("#secret");
const keyValueEl      = document.querySelector("#key-value");
const keyAlgoEl       = document.querySelector("#key-algo");
const keyMetaEl       = document.querySelector("#key-meta");
const keyCopyEl       = document.querySelector("#key-copy");
const scoreValueEl    = document.querySelector("#score-value");
const streakValueEl   = document.querySelector("#streak-value");
const historyCountEl  = document.querySelector("#history-count");

function renderBalance(current) {
  balanceValueEl.textContent = current.balance.toLocaleString("ru-RU");
}

function renderScore(current) {
  scoreValueEl.textContent = String(current.score || 0);
  if (streakValueEl) streakValueEl.textContent = String(current.streak || 0);
  historyCountEl.textContent = String((current.history || []).length);
}

function renderAlgo(current) {
  const algo = ALGORITHMS[current.algo] ?? ALGORITHMS.hmac16;
  algoNoteEl.textContent = algo.note;
}

function renderKey(current) {
  if (!current.lastKey) {
    keyValueEl.textContent = "— — — —";
    keyAlgoEl.textContent = "—";
    keyMetaEl.textContent = "сгенерируй ключ — он появится здесь";
    keyCopyEl.disabled = true;
    return;
  }
  keyValueEl.textContent = current.lastKey.key;
  keyAlgoEl.textContent = ALGORITHMS[current.lastKey.algo].title;
  keyMetaEl.textContent = `сообщение: ${current.lastKey.message}`;
  keyCopyEl.disabled = false;
}

algoEl.innerHTML = DISPLAY_ORDER
  .map((id) => ALGORITHMS[id])
  .filter(Boolean)
  .map((algo) => `<option value="${algo.id}">${algo.title}</option>`)
  .join("");
algoEl.value = state.algo;
hwidEl.value = state.hwid;
secretEl.value = state.secret || "";

algoEl.addEventListener("change", () => update({ algo: algoEl.value }));
hwidEl.addEventListener("input", () => update({ hwid: hwidEl.value }));
secretEl.addEventListener("input", () => update({ secret: secretEl.value }));

balanceResetEl.addEventListener("click", () => {
  changeBalance(1000 - getState().balance);
});

keyCopyEl.addEventListener("click", async () => {
  const key = getState().lastKey?.key;
  if (!key) return;
  try {
    await navigator.clipboard.writeText(key);
    keyCopyEl.textContent = "скопировано";
  } catch (error) {
    console.warn("буфер обмена недоступен", error);
    keyCopyEl.textContent = "не вышло";
  }
  setTimeout(() => { keyCopyEl.textContent = "копировать"; }, 1400);
});

document.querySelector("#tabs").addEventListener("click", (event) => {
  const tab = event.target.closest(".tab");
  if (!tab) return;
  for (const item of document.querySelectorAll(".tab")) {
    item.classList.toggle("is-active", item === tab);
  }
  for (const panel of document.querySelectorAll(".panel")) {
    panel.classList.toggle("is-active", panel.dataset.panel === tab.dataset.tab);
  }
});

subscribe((current) => {
  renderBalance(current);
  renderScore(current);
  renderAlgo(current);
  renderKey(current);
});

renderBalance(state);
renderScore(state);
renderAlgo(state);
renderKey(state);

initRoulette(document);
initMines(document);
initChecksum(document);
initChain(document);
initSafe(document);