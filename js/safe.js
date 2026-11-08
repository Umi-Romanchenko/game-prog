import { hexToBytes, toHex } from "./keygen.js";
import { getState, changeBalance, subscribe } from "./state.js";

const CODE_LENGTH = 4;
const MAX_ATTEMPTS = 8;
const SAFE_SALT = 0x5b;

// Множитель по остатку попыток после угадывания.
const PAYOUTS = {
  7: 10,   // угадал с 1-й попытки
  6: 5,    // со 2-й
  5: 3,
  4: 2.2,
  3: 1.7,
  2: 1.3,
  1: 1.1,
  0: 1.0,  // на последней — только возврат
};

function mixDigest(digest) {
  const bytes = hexToBytes(digest);
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= SAFE_SALT;
  return toHex(bytes).toUpperCase();
}

function scoreGuess(secret, guess) {
  let exact = 0, partial = 0;
  const sUsed = Array(CODE_LENGTH).fill(false);
  const gUsed = Array(CODE_LENGTH).fill(false);

  for (let i = 0; i < CODE_LENGTH; i++) {
    if (guess[i] === secret[i]) {
      exact++;
      sUsed[i] = true;
      gUsed[i] = true;
    }
  }
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (gUsed[i]) continue;
    for (let j = 0; j < CODE_LENGTH; j++) {
      if (sUsed[j]) continue;
      if (guess[i] === secret[j]) {
        partial++;
        sUsed[j] = true;
        gUsed[i] = true;
        break;
      }
    }
  }
  return { exact, partial };
}

let game = null;

export function initSafe(root) {
  const stakeEl   = root.querySelector("#safe-stake");
  const startEl   = root.querySelector("#safe-start");
  const inputEl   = root.querySelector("#safe-input");
  const submitEl  = root.querySelector("#safe-submit");
  const statusEl  = root.querySelector("#safe-status");
  const historyEl = root.querySelector("#safe-history");
  const resultEl  = root.querySelector("#safe-result");

  function status(text) { statusEl.textContent = text; }

  function renderHistory() {
    if (!game || !game.guesses.length) {
      historyEl.innerHTML = `<div class="safe-empty">попыток пока не было</div>`;
      return;
    }
    historyEl.innerHTML = game.guesses.map((g) => `
      <div class="safe-guess">
        <code>${g.guess}</code>
        <span><b>${g.exact}</b> на месте</span>
        <span><b>${g.partial}</b> есть, но не там</span>
      </div>
    `).join("");
  }

  function showResult(won, message) {
    resultEl.hidden = false;
    resultEl.className = `result ${won ? "is-win" : "is-lose"}`;
    resultEl.innerHTML = `
      <div class="result__verdict">${won ? "ВЗЛОМ" : "ЗАКРЫТО"}</div>
      <div class="result__line">${message}</div>
    `;
  }

  function start() {
    const state = getState();
    const stake = Number(stakeEl.value);
    if (!state.lastKey) return status("сначала сгенерируй ключ");
    if (stake < 10) return status("минимальная ставка — 10");
    if (stake > state.balance) return status("недостаточно фишек");

    changeBalance(-stake);
    game = {
      secret: mixDigest(state.lastKey.digest).slice(0, CODE_LENGTH),
      guesses: [],
      attemptsLeft: MAX_ATTEMPTS,
      stake,
      over: false,
    };
    startEl.disabled = true;
    submitEl.disabled = false;
    inputEl.disabled = false;
    inputEl.value = "";
    inputEl.focus();
    resultEl.hidden = true;
    renderHistory();
    status(`попыток ${MAX_ATTEMPTS} · ставка ${stake}`);
  }

  function submit() {
    if (!game || game.over) return;
    const guess = inputEl.value.trim().toUpperCase();
    if (!new RegExp(`^[0-9A-F]{${CODE_LENGTH}}$`).test(guess)) {
      return status(`введи ${CODE_LENGTH} hex-символа (0-9, A-F)`);
    }
    if (game.guesses.some((g) => g.guess === guess)) {
      return status("этот код уже пробовал");
    }

    const { exact, partial } = scoreGuess(game.secret, guess);
    game.guesses.push({ guess, exact, partial });
    game.attemptsLeft -= 1;
    renderHistory();
    inputEl.value = "";
    inputEl.focus();

    if (exact === CODE_LENGTH) {
      const payout = Math.round(game.stake * (PAYOUTS[game.attemptsLeft] ?? 1));
      changeBalance(payout);
      game.over = true;
      startEl.disabled = false;
      submitEl.disabled = true;
      inputEl.disabled = true;
      showResult(true, `код <code>${game.secret}</code> взломан за ${MAX_ATTEMPTS - game.attemptsLeft} попыток · +${payout - game.stake}`);
      status(`взлом · +${payout - game.stake}`);
      return;
    }

    if (game.attemptsLeft <= 0) {
      game.over = true;
      startEl.disabled = false;
      submitEl.disabled = true;
      inputEl.disabled = true;
      showResult(false, `код был <code>${game.secret}</code> · −${game.stake}`);
      status(`закрыто · −${game.stake}`);
      return;
    }

    status(`попыток ${game.attemptsLeft} · на месте ${exact}, есть ${partial}`);
  }

  startEl.addEventListener("click", start);
  submitEl.addEventListener("click", submit);
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  inputEl.addEventListener("input", () => {
    inputEl.value = inputEl.value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, CODE_LENGTH);
  });

  subscribe((state) => {
    if (game && !game.over) return;
    if (!state.lastKey) status("сначала получи ключ");
    else if (!game) status("ключ готов · жми «Старт»");
  });

  status("сначала сгенерируй ключ");
}