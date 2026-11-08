import { base32Parts, hexToBytes, toHex } from "./keygen.js";
import { getState, changeBalance, subscribe } from "./state.js";

const BASE37 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U";

const SCHEMES = [
  {
    id: "mod37",
    title: "Crockford Base32 · mod 37",
    rule: "контрольный символ = BASE37[ сумма индексов 15 символов mod 37 ]",
    multiplier: 4,
    build(digest) {
      const { body, checksum } = base32Parts(digest);
      return {
        display: `${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}-<span class="mask">?</span>`,
        checksum,
      };
    },
    hint: [
      "Crockford Base32, индексы:",
      "0 1 2 3 4 5 6 7 8 9 A B C D E F G H J K M N P Q R S T V W X Y Z",
      "0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31",
      "",
      "1) сложи индексы всех 15 символов",
      "2) возьми остаток по модулю 37",
      `3) подставь его в BASE37 = ${BASE37}`,
    ].join("\n"),
  },
  {
    id: "luhn",
    title: "Luhn · mod 10",
    rule: "удвой каждую 2-ю цифру от правого края, сумма цифр ≡ 0 (mod 10)",
    multiplier: 4,
    build(digest) {
      const digits = [];
      for (let i = 0; i < 15; i++) digits.push(parseInt(digest[i], 16) % 10);
      let sum = 0;
      for (let i = 0; i < 15; i++) {
        let d = digits[i];
        if (i % 2 === 0) {
          d *= 2;
          if (d > 9) d -= 9;
        }
        sum += d;
      }
      const check = String((10 - (sum % 10)) % 10);
      return {
        display: `${digits.slice(0, 5).join("")}-${digits.slice(5, 10).join("")}-${digits.slice(10, 15).join("")}-<span class="mask">?</span>`,
        checksum: check,
      };
    },
    hint: [
      "Алгоритм Луна (mod 10):",
      "1) итог — 16 цифр: 15 известных + 1 контрольная в конце",
      "2) идём справа налево, нумеруем с 1 (контрольная — позиция 1)",
      "3) удваиваем цифры на чётных позициях (2, 4, 6, …)",
      "4) если после удвоения > 9, вычитаем 9",
      "5) сумма всех цифр должна делиться на 10",
      "",
      "значит check = (10 − сумма mod 10) mod 10",
    ].join("\n"),
  },
  {
    id: "mod97",
    title: "IBAN · mod 97",
    rule: "число из 14 цифр × 100 + 2 контрольные цифры ≡ 1 (mod 97)",
    multiplier: 5,
    build(digest) {
      const digits = [];
      for (let i = 0; i < 14; i++) digits.push(parseInt(digest[i], 16) % 10);
      const remainder = digits.reduce((acc, d) => (acc * 10 + d) % 97, 0);
      const check = String((98 - (remainder * 100) % 97) % 97).padStart(2, "0");
      return {
        display: `${digits.slice(0, 4).join("")}-${digits.slice(4, 8).join("")}-${digits.slice(8, 12).join("")}-${digits.slice(12, 14).join("")}<span class="mask">??</span>`,
        checksum: check,
      };
    },
    hint: [
      "Алгоритм IBAN:",
      "1) N = число из 14 цифр",
      "2) r = N mod 97 (пошагово: r = (r*10 + digit) mod 97)",
      "3) check = (98 − (r × 100 mod 97)) mod 97",
      "4) две цифры, с ведущим нулём",
      "",
      "проверка: (N × 100 + check) mod 97 = 1",
    ].join("\n"),
  },
];

/** XOR-микс дайджеста, чтобы пазл не совпадал с ключом в карточке сверху. */
function mixDigest(baseDigest, round) {
  const bytes = hexToBytes(baseDigest);
  const mask = (round + 1) & 0xff;
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= mask;
  return toHex(bytes);
}

export function initChecksum(root) {
  const taskEl     = root.querySelector("#checksum-task");
  const answerEl   = root.querySelector("#checksum-answer");
  const stakeEl    = root.querySelector("#checksum-stake");
  const submitEl   = root.querySelector("#checksum-submit");
  const hintEl     = root.querySelector("#checksum-hint");
  const hintButton = root.querySelector("#checksum-hint-btn");
  const newButton  = root.querySelector("#checksum-new");
  const resultEl   = root.querySelector("#checksum-result");

  let puzzle = null;
  let scheme = null;
  let round = 0;
  let lastKey = null;

  function pickScheme(exclude) {
    const pool = exclude && SCHEMES.length > 1
      ? SCHEMES.filter((s) => s !== exclude)
      : SCHEMES;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function renderTask() {
    const state = getState();
    if (!state.lastKey) {
      puzzle = null;
      scheme = null;
      submitEl.disabled = true;
      taskEl.textContent = "сначала сгенерируй ключ";
      return;
    }

    if (!scheme) scheme = pickScheme(null);

    const digest = mixDigest(state.lastKey.digest, round);
    const built = scheme.build(digest);
    puzzle = { ...built, scheme, multiplier: scheme.multiplier };
    submitEl.disabled = false;
    answerEl.value = "";
    answerEl.maxLength = puzzle.checksum.length;
    answerEl.placeholder = "?".repeat(puzzle.checksum.length);
    hintEl.hidden = true;

    taskEl.innerHTML = `
      ${puzzle.display}
      <span class="rule"><b>${scheme.title}</b> · ${scheme.rule}</span>
    `;
  }

  function showResult(won, message) {
    resultEl.hidden = false;
    resultEl.className = `result ${won ? "is-win" : "is-lose"}`;
    resultEl.innerHTML = `
      <div class="result__verdict">${won ? "ВЕРНО" : "МИМО"}</div>
      <div class="result__line">${message}</div>
    `;
  }

  function nextPuzzle() {
    round += 1;
    scheme = pickScheme(scheme);
    renderTask();
  }

  function submit() {
    if (!puzzle) return;

    const state = getState();
    const stake = Number(stakeEl.value);
    const rawAnswer = answerEl.value.trim().toUpperCase();

    if (!rawAnswer) return showResult(false, "введи ответ");
    if (stake < 10) return showResult(false, "минимальная ставка — 10 фишек");
    if (stake > state.balance) return showResult(false, "недостаточно фишек");

    const normalized = puzzle.checksum.length === 2
      ? rawAnswer.padStart(2, "0")
      : rawAnswer;
    const won = normalized === puzzle.checksum;

    const delta = won ? stake * (puzzle.multiplier - 1) : -stake;
    changeBalance(delta);

    showResult(won, won
      ? `ответ <code>${puzzle.checksum}</code> · <b class="up">+${delta}</b>`
      : `правильный — <code>${puzzle.checksum}</code> · <b class="down">${delta}</b>`
    );

    nextPuzzle();
  }

  function toggleHint() {
    hintEl.hidden = !hintEl.hidden;
    if (hintEl.hidden || !scheme) return;
    hintEl.textContent = scheme.hint;
  }

  function newPuzzleManual() {
    resultEl.hidden = true;
    nextPuzzle();
  }

  submitEl.addEventListener("click", submit);
  answerEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submit();
  });
  hintButton.addEventListener("click", toggleHint);
  if (newButton) newButton.addEventListener("click", newPuzzleManual);

  subscribe((state) => {
    if (state.lastKey === lastKey) return;
    lastKey = state.lastKey;
    round = 0;
    scheme = null;
    resultEl.hidden = true;
    renderTask();
  });

  renderTask();
}