/*
 * 数字の選び方。DOM に依存しない純粋関数だけを置く。
 *
 * ★ 大前提 ★
 * 抽せんは毎回独立していて、過去の出目から次回を当てることはできない。
 * このファイルのどこにも「当たりやすくする」処理は無いし、書けない。
 *
 * 唯一、意味のある操作が「被りにくくする」こと。
 * 当たる確率は変わらないが、当たったときに賞金を分け合う人数を減らせる。
 * 数字選択式の当せん金は「当せん口数で山分け」なので、これは本当に効く。
 */

/* ---------- 乱数 ---------- */

/* 文字列 → 32bit のシード(xmur3) */
function seedFromString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/* mulberry32。同じシードからは必ず同じ並びが出る */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * 毎回ちがう結果が欲しいときの乱数。
 * Math.random ではなく crypto を使う。くじの番号を作る道具で
 * 「実は偏っていた」は避けたいので、素性のはっきりした方を選ぶ。
 */
function cryptoRng() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return function () {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] / 4294967296;
    };
  }
  return Math.random;
}

/* ---------- 重みつき抽出 ---------- */

/* weights[i] に比例して、重複なしで k 個選ぶ */
function weightedSample(weights, k, rng) {
  const pool = weights.map((w, i) => ({ n: i + 1, w }));
  const out = [];
  for (let c = 0; c < k; c++) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let x = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      x -= pool[i].w;
      if (x <= 0) { idx = i; break; }
    }
    out.push(pool[idx].n);
    pool.splice(idx, 1);
  }
  return out.sort((a, b) => a - b);
}

/* ---------- 「被りにくさ」の評価 ---------- */

/*
 * 人が選びがちな形を判定する。
 * 出典は各くじの当せん口数の偏りで、いちばん大きいのは誕生日。
 * 1〜31(日)と1〜12(月)に票が集まるので、32以上は相対的に空いている。
 */
function popularityNotes(nums, max) {
  const notes = [];
  const has32 = nums.some((n) => n > 31);
  const allSmall = nums.every((n) => n <= 31);
  const allMonth = nums.every((n) => n <= 12);

  if (max > 31) {
    if (has32) notes.push({ good: true, text: "32以上の数字が入っている(誕生日で選ぶ人が届かない範囲)" });
    else notes.push({ good: false, text: "全部31以下。誕生日で選ぶ人と重なりやすい並び" });
  } else if (!allMonth) {
    notes.push({ good: true, text: "13以上の数字が入っている(「月」として選ばれにくい範囲)" });
  }
  if (allSmall && max > 31) { /* 上でカバー済み */ }

  // 連番。人は「バラバラの方が当たりそう」と感じて避けるが、実際は普通に出る
  let runs = 0;
  for (let i = 1; i < nums.length; i++) if (nums[i] === nums[i - 1] + 1) runs++;
  if (runs > 0) notes.push({ good: true, text: `連番が${runs}組ある(避ける人が多いぶん、選ぶ人が少ない)` });

  // 等差(1,8,15,22…)はマークシート上できれいな形になるので選ばれやすい
  if (nums.length >= 3) {
    const d = nums[1] - nums[0];
    if (nums.every((n, i) => i === 0 || n - nums[i - 1] === d)) {
      notes.push({ good: false, text: "等間隔に並んでいる。マークシート上で目を引く形なので選ばれやすい" });
    }
  }

  // 下1桁がそろっている(3,13,23,33)のも人気の形
  const lastDigits = new Set(nums.map((n) => n % 10));
  if (lastDigits.size <= Math.max(1, Math.floor(nums.length / 3))) {
    notes.push({ good: false, text: "下1桁が偏っている。まとめて選ぶ人がいる形" });
  }

  return notes;
}

/* 合計値。中央付近に人が集まるので、そこから外れているかを見る */
function sumInfo(nums, pick, max) {
  const sum = nums.reduce((a, b) => a + b, 0);
  const center = pick * (max + 1) / 2;
  return { sum, center: Math.round(center), off: sum - center };
}

/* ---------- ロト系(1〜maxからpick個) ---------- */

/*
 * mode:
 *   "random"    … 完全にランダム。いちばん正直な選び方
 *   "unpopular" … 人と被りにくい並びに寄せる
 */
function pickChoose(game, mode, rng) {
  const { pick, max } = game;

  if (mode !== "unpopular") {
    const w = new Array(max).fill(1);
    return weightedSample(w, pick, rng);
  }

  /*
   * 誕生日で選ばれにくい範囲に重みを寄せる。
   * 32以上が使えるくじ(ロト6/7)ではそこを厚く、
   * 31までしかないミニロトでは「月」に使われる1〜12を薄くする。
   */
  const w = [];
  for (let n = 1; n <= max; n++) {
    if (max > 31) w.push(n > 31 ? 1.7 : (n <= 12 ? 0.8 : 1.0));
    else w.push(n <= 12 ? 0.75 : 1.3);
  }

  // 条件を満たすまで引き直す。満たせなくても最後の候補を返す(無限に回さない)
  let best = null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const nums = weightedSample(w, pick, rng);
    const notes = popularityNotes(nums, max);
    const bad = notes.filter((x) => !x.good).length;
    const good = notes.filter((x) => x.good).length;
    if (bad === 0 && good >= (max > 31 ? 1 : 1)) return nums;
    if (!best || bad < best.bad) best = { nums, bad };
  }
  return best.nums;
}

/* ---------- ナンバーズ ---------- */

/* 人が選びがちな並び。ゾロ目・階段・日付は毎回たくさんの人が買う */
function digitNotes(digits) {
  const s = digits.join("");
  const notes = [];
  const allSame = digits.every((d) => d === digits[0]);
  const up = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const down = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);

  if (allSame) notes.push({ good: false, text: "ゾロ目。毎回たくさんの人が買う並び" });
  if (up || down) notes.push({ good: false, text: "階段(連続した数字)。これも定番の並び" });

  if (digits.length === 4) {
    const mm = digits[0] * 10 + digits[1];
    const dd = digits[2] * 10 + digits[3];
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      notes.push({ good: false, text: "月日として読める並び(記念日で買う人と重なりやすい)" });
    }
  }
  if (!allSame && !up && !down && notes.length === 0) {
    notes.push({ good: true, text: "ゾロ目・階段・日付のどれにも当てはまらない並び" });
  }
  return notes;
}

function pickDigits(game, mode, rng) {
  const n = game.digits;
  const draw = () => Array.from({ length: n }, () => Math.floor(rng() * 10));
  if (mode !== "unpopular") return draw();

  for (let attempt = 0; attempt < 300; attempt++) {
    const d = draw();
    if (digitNotes(d).every((x) => x.good)) return d;
  }
  return draw();
}

/* ---------- ビンゴ5 ---------- */

function pickBingo(game, mode, rng) {
  const out = game.cells.map((range) => {
    if (!range) return null; // 中央はFREE
    const [lo, hi] = range;
    return lo + Math.floor(rng() * (hi - lo + 1));
  });

  if (mode !== "unpopular") return out;

  /*
   * マスごとに5択しかないので、番号そのものの人気差は小さい。
   * ただし「各マスの何番目を選ぶか」がそろっていると
   * (全部いちばん上、など)マークシート上で同じ形になり、被りやすい。
   */
  for (let attempt = 0; attempt < 200; attempt++) {
    const offsets = out.map((v, i) => (v === null ? null : v - game.cells[i][0]));
    const used = new Set(offsets.filter((x) => x !== null));
    if (used.size >= 3) return out;
    for (let i = 0; i < out.length; i++) {
      if (game.cells[i]) {
        const [lo, hi] = game.cells[i];
        out[i] = lo + Math.floor(rng() * (hi - lo + 1));
      }
    }
  }
  return out;
}

/* ---------- toto ---------- */

function pickToto(game, mode, rng) {
  const marks = ["1", "0", "2"];
  /*
   * 引き分け(0)は実際には3分の1より少なく出るが、
   * 買う人は「1・2・0を均等に散らす」ことが多い。
   * ここは素直に3等分のままにしておく。試合の中身を知らずに
   * 重みを変えるのは、根拠のない味付けになるため。
   */
  return Array.from({ length: game.matches }, () => marks[Math.floor(rng() * 3)]);
}

/* ---------- まとめ ---------- */

/*
 * 1口分を作る。
 * mode が "lucky" のときは seedKey から作った疑似乱数を使うので、
 * 同じ生年月日・同じ日なら何度押しても同じ数字が出る。
 */
function generateOne(gameKey, mode, seedKey) {
  const game = GAMES[gameKey];
  const rng = mode === "lucky" ? makeRng(seedFromString(seedKey)) : cryptoRng();
  const effective = mode === "lucky" ? "random" : mode;

  if (game.kind === "choose") {
    const nums = pickChoose(game, effective, rng);
    return {
      kind: "choose",
      nums,
      notes: popularityNotes(nums, game.max),
      sum: sumInfo(nums, game.pick, game.max),
      text: nums.map((n) => String(n).padStart(2, "0")).join(" "),
    };
  }
  if (game.kind === "digits") {
    const d = pickDigits(game, effective, rng);
    return { kind: "digits", digits: d, notes: digitNotes(d), text: d.join("") };
  }
  if (game.kind === "bingo") {
    const cells = pickBingo(game, effective, rng);
    return {
      kind: "bingo",
      cells,
      notes: [],
      text: cells.map((v) => (v === null ? "FREE" : String(v))).join(" "),
    };
  }
  const marks = pickToto(game, effective, rng);
  return { kind: "toto", marks, notes: [], text: marks.join(" ") };
}

/* count 口分。lucky のときは口ごとにシードを変える */
function generateSets(gameKey, mode, count, seedKey) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(generateOne(gameKey, mode, `${seedKey}#${i}`));
  }
  return out;
}
