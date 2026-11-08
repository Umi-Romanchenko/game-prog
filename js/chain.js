import { hexToBytes, toHex } from "./keygen.js";
import { getState, changeBalance, subscribe } from "./state.js";

const EDGE = 0.95;
const CHAIN_SALT = 0x37;

function mixDigest(digest) {
  const bytes = hexToBytes(digest);
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= CHAIN_SALT;
  return toHex(bytes).toUpperCase();
}

function multiplier(prob) {
  return Math.max(1.05, Math.round((EDGE / prob) * 100) / 100);
}

function optionsFor(value) {
  return [
    { id: "less", label: "меньше", prob: value / 16 },
    { id: "eq",   label: "равно", prob: 1 / 16 },
    { id: "more", label: "больше", prob: (15 - value) / 16 },
  ].filter((o) => o.prob > 0);
}

let game = null;

export function initChain(root) {
  const stakeEl   = root.querySelector("#chain-stake");
  const startEl   = root.querySelector("#chain-start");
  const cashEl    = root.querySelector("#chain-cashout");
  const statusEl  = root.querySelector("#chain-status");
  const stripEl   = root.querySelector("#chain-strip");
  const buttonsEl = root.querySelector("#chain-buttons");
  const resultEl  = root.querySelector("#chain-result");

  function status(text) { statusEl.textContent = text; }

  function renderStrip() {
    if (!game) { stripEl.innerHTML = ""; return; }
    stripEl.innerHTML = [...game.digest].map((ch, i) => {
      let cls = "chain-cell";
      if (i < game.step) cls += " is-done";
      else if (i === game.step) cls += " is-current";
      return `<span class="${cls}">${ch}</span>`;
    }).join("");
  }

  function renderButtons() {
    buttonsEl.innerHTML = "";
    if (!game || game.over) return;
    const value = parseInt(game.digest[game.step], 16);
    for (const opt of optionsFor(value)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--primary chain-opt";
      btn.dataset.opt = opt.id;
      btn.innerHTML = `${opt.label} <small>×${multiplier(opt.prob).toFixed(2)}</small>`;
      buttonsEl.append(btn);
    }
  }

  function showResult(won, message) {
    resultEl.hidden = false;
    resultEl.className = `result ${won ? "is-win" : "is-lose"}`;
    resultEl.innerHTML = `
      <div class="result__verdict">${won ? "ЗАБРАЛ" : "ОБОРВАЛОСЬ"}</div>
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
      digest: mixDigest(state.lastKey.digest).slice(0, 16),
      step: 0,
      stake,
      multiplier: 1,
      over: false,
    };
    startEl.disabled = true;
    cashEl.disabled = true;
    cashEl.textContent = "Забрать";
    resultEl.hidden = true;
    renderStrip();
    renderButtons();
    status(`шаг 1 · ставка ${stake} · множитель ×1.00`);
  }

  function pick(optId) {
    if (!game || game.over) return;
    const value = parseInt(game.digest[game.step], 16);
    const next = parseInt(game.digest[game.step + 1], 16);
    const opt = optionsFor(value).find((o) => o.id === optId);
    if (!opt) return;

    let won;
    if (optId === "less") won = next < value;
    else if (optId === "more") won = next > value;
    else won = next === value;

    if (!won) {
      game.over = true;
      startEl.disabled = false;
      cashEl.disabled = true;
      renderStrip();
      renderButtons();
      showResult(false, `ставка ${game.stake} сгорела · −${game.stake}`);
      status(`оборвалось на шаге ${game.step + 1} · −${game.stake}`);
      return;
    }

    game.multiplier *= multiplier(opt.prob);
    game.step += 1;

    if (game.step >= game.digest.length - 1) {
      const payout = Math.round(game.stake * game.multiplier);
      changeBalance(payout);
      game.over = true;
      startEl.disabled = false;
      cashEl.disabled = true;
      renderStrip();
      renderButtons();
      showResult(true, `дошёл до конца · ×${game.multiplier.toFixed(2)} · +${payout - game.stake}`);
      status(`финиш · +${payout - game.stake}`);
      return;
    }

    renderStrip();
    renderButtons();
    cashEl.disabled = false;
    cashEl.textContent = `Забрать ${Math.round(game.stake * game.multiplier)}`;
    status(`шаг ${game.step + 1} · множитель ×${game.multiplier.toFixed(2)}`);
  }

  function cashout() {
    if (!game || game.over || game.step === 0) return;
    const payout = Math.round(game.stake * game.multiplier);
    changeBalance(payout);
    game.over = true;
    startEl.disabled = false;
    cashEl.disabled = true;
    renderButtons();
    showResult(true, `забрал ${payout} · чистыми +${payout - game.stake}`);
    status(`забрал · +${payout - game.stake}`);
  }

  startEl.addEventListener("click", start);
  cashEl.addEventListener("click", cashout);
  buttonsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".chain-opt");
    if (btn) pick(btn.dataset.opt);
  });

  subscribe((state) => {
    if (game && !game.over) return;
    if (!state.lastKey) status("сначала получи ключ");
    else if (!game) status("ключ готов · жми «Старт»");
  });

  status("сначала сгенерируй ключ");
}