import { formatMultiplier } from "./probability.js";
import { getState, changeBalance, subscribe } from "./state.js";

const SIZE = 16;
const EDGE = 0.95;

let round = 0;
let game = null;

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Раскладка мин детерминирована ключом и номером раунда — но ключ игрок не видит внутри. */
function buildMines(digest, roundNumber, mineCount) {
  const random = mulberry32(fnv1a(`${digest}:${roundNumber}`));
  const cells = [...Array(SIZE).keys()];
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return new Set(cells.slice(0, mineCount));
}

function combinations(n, k) {
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return result;
}

/** Честный множитель: C(16, k) / C(16 - mines, k), урезанный на 5 %. */
function multiplier(opened, mineCount) {
  if (opened === 0) return 1;
  return (combinations(SIZE, opened) / combinations(SIZE - mineCount, opened)) * EDGE;
}

export function initMines(root) {
  const countEl   = root.querySelector("#mines-count");
  const stakeEl   = root.querySelector("#mines-stake");
  const startEl   = root.querySelector("#mines-start");
  const cashoutEl = root.querySelector("#mines-cashout");
  const statusEl  = root.querySelector("#mines-status");
  const gridEl    = root.querySelector("#mines-grid");

  function status(text) {
    statusEl.textContent = text;
  }

  function setCashout(enabled, opened) {
    cashoutEl.disabled = !enabled;
    if (enabled) cashoutEl.textContent = `Забрать ${formatMultiplier(multiplier(opened, game.mineCount))}`;
  }

  function renderGrid() {
    gridEl.innerHTML = "";
    for (let index = 0; index < SIZE; index++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "mine";
      cell.dataset.index = String(index);
      cell.disabled = !game || game.over;
      gridEl.append(cell);
    }
  }

  function paintOpened(index) {
    const cell = gridEl.querySelector(`[data-index="${index}"]`);
    if (!cell) return;
    cell.disabled = true;
    cell.classList.add("is-open");
    cell.textContent = "×";
  }

  function revealBoard(boomIndex) {
    for (const index of game.mines) {
      const cell = gridEl.querySelector(`[data-index="${index}"]`);
      if (!cell) continue;
      cell.disabled = true;
      if (boomIndex !== null && index === boomIndex) {
        cell.classList.add("is-boom");
        cell.textContent = "✕";
      } else {
        cell.classList.add("is-shown");
        cell.textContent = "•";
      }
    }
  }

  function finish(winAmount, message, boomIndex = null) {
    game.over = true;
    revealBoard(boomIndex);
    for (const cell of gridEl.querySelectorAll(".mine")) cell.disabled = true;
    if (winAmount > 0) changeBalance(winAmount);
    setCashout(false, 0);
    startEl.disabled = false;
    status(message);
  }

  function start() {
    const state = getState();
    const stake = Number(stakeEl.value);
    const mineCount = Number(countEl.value);

    if (!state.lastKey) return status("сначала сгенерируй ключ");
    if (stake < 10) return status("минимальная ставка — 10 фишек");
    if (stake > state.balance) return status("недостаточно фишек");

    round += 1;
    game = {
      mines: buildMines(state.lastKey.digest, round, mineCount),
      opened: new Set(),
      stake,
      mineCount,
      keyDigest: state.lastKey.digest,
      over: false,
    };

    changeBalance(-stake);
    renderGrid();
    startEl.disabled = true;
    setCashout(false, 0);

    const firstMult = formatMultiplier(multiplier(1, mineCount));
    status(`ставка ${stake} · мин ${mineCount} · открыто 0/${SIZE - mineCount} · следующая ${firstMult}`);
  }

  function open(index) {
    if (!game || game.over || game.opened.has(index)) return;

    if (game.mines.has(index)) {
      finish(0, `взрыв на клетке ${index + 1} · −${game.stake}`, index);
      return;
    }

    game.opened.add(index);
    paintOpened(index);

    const safeTotal = SIZE - game.mineCount;
    if (game.opened.size === safeTotal) {
      const payoutSum = Math.round(game.stake * multiplier(game.opened.size, game.mineCount));
      finish(payoutSum, `поле вычищено · +${payoutSum - game.stake}`);
      return;
    }

    setCashout(true, game.opened.size);
    const currentMult = formatMultiplier(multiplier(game.opened.size, game.mineCount));
    const nextMult = formatMultiplier(multiplier(game.opened.size + 1, game.mineCount));
    status(`открыто ${game.opened.size}/${safeTotal} · сейчас ${currentMult} · следующая ${nextMult}`);
  }

  function cashout() {
    if (!game || game.over || game.opened.size === 0) return;
    const payoutSum = Math.round(game.stake * multiplier(game.opened.size, game.mineCount));
    finish(payoutSum, `забрал ${payoutSum} · чистыми +${payoutSum - game.stake}`);
  }

  startEl.addEventListener("click", start);
  cashoutEl.addEventListener("click", cashout);
  gridEl.addEventListener("click", (event) => {
    const cell = event.target.closest(".mine");
    if (cell) open(Number(cell.dataset.index));
  });

  subscribe((state) => {
    const digest = state.lastKey?.digest ?? null;
    if (game) {
      if (!game.over) return;
      if (game.keyDigest === digest) return;
    }
    game = null;
    renderGrid();
    if (!digest) status("сначала получи ключ в рулетке");
    else status(`ключ готов · мин ${countEl.value} · жми «Начать»`);
  });

  renderGrid();
}