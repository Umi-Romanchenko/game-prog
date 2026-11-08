/**
 * Генерация лицензионных ключей из HWID — только Web Crypto, без сервера.
 *
 * Все схемы детерминированы: одинаковые (secret, message) дают одинаковый ключ.
 * Здесь лежит игрушечный SECRET для игровой рулетки, а настоящий секрет
 * пользователь приносит сам — через параметр userSecret.
 *
 * crypto.subtle работает только в secure context: https или localhost.
 */

const encoder = new TextEncoder();

export const SECRET = "keygen-arcade/v1:5f3c8d21a94e";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 символа, без I, L, O, U
const BASE37 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U"; // + 5 символов под контрольный

const ASCII_ONLY = /^[\x20-\x7e]*$/;

export function assertAscii(value, label = "HWID") {
  if (!ASCII_ONLY.test(value)) {
    throw new Error(`${label}: допустимы только ASCII-символы (0x20–0x7E)`);
  }
  return value;
}

export function toHex(bytes) {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

export function group(text, size = 4, separator = "-") {
  return text.match(new RegExp(`.{1,${size}}`, "g")).join(separator);
}

export function randomSalt() {
  return toHex(crypto.getRandomValues(new Uint8Array(4))).toUpperCase();
}

/** HMAC-SHA256(secret, message) в hex. Аналог hmac.new(...).hexdigest() из Python. */
export async function hmacHex(secret, message) {
  assertAscii(message, "message");
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(new Uint8Array(signature));
}

/* ---------- схема 1: HMAC-16 ---------- */

/** 16 первых hex-символов дайджеста, группы по 4 — ровно как в присланном питоне. */
function buildHmac16(digest) {
  const raw = digest.slice(0, 16).toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

/* ---------- схема 2: Base32 + контрольный символ mod 37 ---------- */

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = ((value << 8) | byte) >>> 0;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

/** 15 значимых символов + один контрольный по сумме индексов mod 37. */
export function base32Parts(digest) {
  const body = base32Encode(hexToBytes(digest).slice(0, 10)).slice(0, 15);
  let sum = 0;
  for (const char of body) sum += CROCKFORD.indexOf(char);
  return { body, checksum: BASE37[sum % 37] };
}

function buildBase32(digest) {
  const { body, checksum } = base32Parts(digest);
  return group(body + checksum);
}

/* ---------- схема 3: контрольные цифры mod 97 ---------- */

function buildMod97(digest) {
  const digits = [];
  for (let i = 0; i < 14; i++) digits.push(parseInt(digest[i], 16) % 10);
  const remainder = digits.reduce((acc, digit) => (acc * 10 + digit) % 97, 0);
  const check = (98 - (remainder * 100) % 97) % 97;
  return group(digits.join("") + String(check).padStart(2, "0"));
}

/* ---------- схема 4: подписанный токен ---------- */

async function buildToken(digest, context) {
  const tier = 1 + (parseInt(digest[0], 16) % 3);
  const days = [30, 90, 180, 365][parseInt(digest[1], 16) % 4];
  const payload = `T${tier}-${days}D`;
  const signature = (await hmacHex(SECRET, `${context.message}|${payload}`)).slice(0, 8).toUpperCase();
  return `${payload}-${signature.slice(0, 4)}-${signature.slice(4, 8)}`;
}

export const ALGORITHMS = {
  hmac16: {
    id: "hmac16",
    title: "HMAC-16",
    note: "16 первых hex-символов HMAC-SHA256, группы по 4. Один и тот же HWID всегда даёт один и тот же ключ.",
    build: (digest) => buildHmac16(digest),
  },
  base32: {
    id: "base32",
    title: "Base32 + mod 37",
    note: "Схема ключей Microsoft: 15 символов Crockford Base32 плюс контрольный символ по сумме индексов mod 37.",
    build: (digest) => buildBase32(digest),
  },
  mod97: {
    id: "mod97",
    title: "Mod-97",
    note: "Схема IBAN: 14 цифр нагрузки и 2 контрольные, чтобы всё число давало остаток 1 по модулю 97.",
    build: (digest) => buildMod97(digest),
  },
  token: {
    id: "token",
    title: "Подписанный токен",
    note: "Тариф и срок в открытом виде плюс усечённая HMAC-подпись. Payload читается, подпись — нет.",
    build: (digest, context) => buildToken(digest, context),
  },
};

/**
 * @param {string} hwid
 * @param {string} algoId
 * @param {string} salt
 * @param {string} userSecret — если задан, используется вместо игрушечного SECRET
 * @returns {Promise<{algo: string, message: string, digest: string, core: number[], key: string}>}
 */
export async function generateKey(hwid, algoId, salt = "", userSecret = "") {
  const algo = ALGORITHMS[algoId] ?? ALGORITHMS.hmac16;
  const message = salt ? `${hwid}#${salt}` : hwid;
  const secret = userSecret || SECRET;
  if (userSecret) assertAscii(userSecret, "секрет");

  const digest = await hmacHex(secret, message);
  const core = digest.slice(0, 16).toUpperCase().split("").map((char) => parseInt(char, 16));
  return {
    algo: algo.id,
    message,
    digest,
    core,
    key: await algo.build(digest, { hwid, message }),
  };
}

/* ---------- оценка редкости сгенерированного ключа ---------- */

const HEX_WORDS = [
  "C0DE", "DEAD", "BEEF", "FACE", "CAFE",
  "BABE", "FADE", "0DAY", "D00D", "BAAD", "C0FF", "EE00",
];

/**
 * Разбирает digest на «интересные» признаки и возвращает тир с бонусом.
 * Чем выше score — тем выше тир и награда.
 */
export function rateDigest(digest) {
  const hex = digest.slice(0, 16).toUpperCase();
  const features = [];

  for (const word of HEX_WORDS) {
    if (hex.includes(word)) {
      features.push({ label: `слово ${word}`, weight: 3 });
      break;
    }
  }

  if (hex === [...hex].reverse().join("")) {
    features.push({ label: "палиндром", weight: 6 });
  }

  if (/^\d{16}$/.test(hex)) {
    features.push({ label: "только цифры", weight: 5 });
  } else if (/^[A-F]{16}$/.test(hex)) {
    features.push({ label: "только буквы", weight: 5 });
  }

  const sum = [...hex].reduce((acc, char) => acc + parseInt(char, 16), 0);
  if (sum >= 145) features.push({ label: `сумма ${sum}`, weight: 2 });
  if (sum <= 95)  features.push({ label: `сумма ${sum}`, weight: 2 });

  if (/(.)\1\1\1/.test(hex)) {
    features.push({ label: "квадрупль", weight: 4 });
  } else if (/(.)\1\1/.test(hex)) {
    features.push({ label: "трипл", weight: 1 });
  }

  if (hex.slice(0, 8) === hex.slice(8, 16)) {
    features.push({ label: "две половинки совпали", weight: 5 });
  }

  const first4 = hex.slice(0, 4);
  const last4Reversed = [...hex.slice(12, 16)].reverse().join("");
  if (first4 === last4Reversed) {
    features.push({ label: "зеркало 4+4", weight: 2 });
  }

  const score = features.reduce((acc, feature) => acc + feature.weight, 0);

  let tier, title, bonus;
  if (score >= 6)       { tier = "epic";     title = "ЭПИК";        bonus = 50; }
  else if (score >= 3)  { tier = "rare";     title = "РЕДКИЙ";      bonus = 20; }
  else if (score >= 1)  { tier = "uncommon"; title = "ЛЮБОПЫТНЫЙ";  bonus = 5;  }
  else                  { tier = "common";   title = "ОБЫЧНЫЙ";     bonus = 0;  }

  return { tier, title, bonus, features, score };
}