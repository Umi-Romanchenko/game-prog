const STORAGE_KEY = "keygen-arcade:v1";
const listeners = new Set();

const state = {
  balance: 1000,
  hwid: "",
  algo: "hmac16",
  secret: "",
  score: 0,
  streak: 0,
  history: [],
  lastKey: null,
};

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function update(patch) {
  Object.assign(state, patch);
  persist();
  for (const listener of listeners) listener(state);
}

export function changeBalance(delta) {
  const balance = Math.max(0, state.balance + delta);
  update({ balance });
  return balance;
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (error) {
    console.warn("не удалось прочитать сохранение", error);
  }
  return state;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      balance: state.balance,
      hwid: state.hwid,
      algo: state.algo,
      secret: state.secret,
      score: state.score,
      streak: state.streak,
      history: state.history,
    }));
  } catch (error) {
    console.warn("не удалось сохранить состояние", error);
  }
}