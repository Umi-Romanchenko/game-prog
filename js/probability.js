/**
 * Точные вероятности исходов рулетки.
 *
 * Ядро ключа — 16 независимых hex-символов (0..15) с равномерным распределением,
 * потому что это префикс HMAC-SHA256. Значит любую ставку можно посчитать
 * без симуляций: биномиалка для количества цифр, ДП для суммы.
 */

const CORE_LENGTH = 16;
const HEX_FACES = 16;
const EDGE = 0.95; // заведение забирает 5 %

export const HEX_DIGITS = "0123456789ABCDEF";
export const CODE_WORDS = ["C0DE", "DEAD", "BEEF", "FACE", "CAFE", "BABE", "FADE", "0DAY"];

/** Распределение суммы n независимых бросков кубика с faces гранями. */
function sumDistribution(n, faces) {
  let dist = [1];
  for (let roll = 0; roll < n; roll++) {
    const next = new Array(dist.length + faces - 1).fill(0);
    for (let sum = 0; sum < dist.length; sum++) {
      if (!dist[sum]) continue;
      for (let face = 0; face < faces; face++) next[sum + face] += dist[sum] / faces;
    }
    dist = next;
  }
  return dist;
}

const SUM_DISTRIBUTION = sumDistribution(CORE_LENGTH, HEX_FACES);

function sumAbove(threshold) {
  let total = 0;
  for (let sum = threshold + 1; sum < SUM_DISTRIBUTION.length; sum++) total += SUM_DISTRIBUTION[sum];
  return total;
}

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function toHexString(core) {
  return core.map((value) => HEX_DIGITS[value]).join("");
}

export function payout(probability) {
  return Math.max(1.05, Math.round((EDGE / probability) * 100) / 100);
}

export function formatMultiplier(value) {
  if (value < 10) return `×${value.toFixed(2)}`;
  return `×${Math.round(value).toLocaleString("ru-RU")}`;
}

export const BETS = [
  {
    id: "symbol-any",
    title: "Символ встретится",
    hint: "выбранный hex-символ есть хотя бы в одном из 16 разрядов",
    param: "symbol",
    probability: 1 - (15 / 16) ** CORE_LENGTH,
    test: (core, params) => core.includes(params.symbol),
  },
  {
    id: "symbol-first",
    title: "Первый разряд",
    hint: "ядро ключа начинается ровно с этого символа",
    param: "symbol",
    probability: 1 / HEX_FACES,
    test: (core, params) => core[0] === params.symbol,
  },
  {
    id: "digits-only",
    title: "Только цифры",
    hint: "все 16 разрядов — 0–9, ни одной буквы",
    probability: (10 / 16) ** CORE_LENGTH,
    test: (core) => core.every((value) => value < 10),
  },
  {
    id: "letters-only",
    title: "Только буквы",
    hint: "все 16 разрядов — A–F. Джекпот",
    probability: (6 / 16) ** CORE_LENGTH,
    test: (core) => core.every((value) => value >= 10),
  },
  {
    id: "sum-even",
    title: "Чётная сумма",
    hint: "сумма hex-значений всех разрядов делится на 2",
    probability: 0.5,
    test: (core) => core.reduce((acc, value) => acc + value, 0) % 2 === 0,
  },
  {
    id: "all-unique",
    title: "Все разные",
    hint: "ни один символ не повторяется ни разу",
    probability: factorial(CORE_LENGTH) / HEX_FACES ** CORE_LENGTH,
    test: (core) => new Set(core).size === CORE_LENGTH,
  },
  {
    id: "sum-high",
    title: "Сумма больше 130",
    hint: "средняя сумма — 120, ставка на «тяжёлое» ядро",
    probability: sumAbove(130),
    test: (core) => core.reduce((acc, value) => acc + value, 0) > 130,
  },
  {
    id: "code-word",
    title: "Кодовое слово",
    hint: "внутри ключа целиком встречается hex-слово",
    param: "word",
    probability: 1 - (1 - 1 / HEX_FACES ** 4) ** (CORE_LENGTH - 3),
    test: (core, params) => toHexString(core).includes(params.word),
  },
];