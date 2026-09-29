/*
 * ジャンボ宝くじの「発売期間中の吉日カレンダー」を作るための暦計算。
 *
 * 暦の中身は一切ここで書かず、生まれ日診断(birthday-fortune)の本体JSを
 * node の vm で読み込んで使う。表と本文と検算が同じ関数から出るので、
 * 記事の数字と画面の数字が食い違わない。
 *   → 検証スクリプトに本体ロジックを写さないこと(写すと本体を直しても古い答えを報告する)
 *
 * 使い方:
 *   生成   node scripts/jumbo-koyomi.js --from 2026-11-25 --to 2026-12-22 --draw 2026-12-31
 *   検算   node scripts/jumbo-koyomi.js --from ... --to ... --draw ... --verify guide/xxx/index.html
 *   表だけ node scripts/jumbo-koyomi.js --from ... --to ... --rows
 *
 * --verify は記事のHTMLに、ここで組み立てた <tr> が1行残らず入っているかと、
 * 集計値の文字列が入っているかを見る。1つでも欠ければ 1 で終了する。
 */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", ".."); // ツール開発/
const BF = path.join(ROOT, "projects", "hakoniwa-lab", "birthday-fortune");

/* 読み込む順番は依存の順。dayPillarIndex は chart.js にある */
const SRC_ORDER = [
  "js/astro.js",
  "js/fortune.js",
  "js/chart.js",
  "js/data.js",
  "js/koyomi.js",
  "js/holiday.js",
  "js/season72.js",
];

function loadKoyomi() {
  const src = SRC_ORDER.map((f) => {
    const p = path.join(BF, f);
    if (!fs.existsSync(p)) throw new Error("暦のソースが無い: " + p);
    return fs.readFileSync(p, "utf8");
  }).join("\n");

  const ctx = { console, Math, Date, JSON, Number, String, Array, Object, isNaN, parseInt, parseFloat, RegExp };
  ctx.window = ctx;
  // ブラウザ前提のコードが触りにいくので、空のダミーを渡す
  ctx.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  if (typeof ctx.dayKoyomi !== "function") throw new Error("dayKoyomi が読み込めていない");
  return ctx;
}

const WEEK = "日月火水木金土".split("");

/* 吉日の定義。ハロウィンジャンボの記事と同じ並び順にする(記事どうしを比べられるように) */
function goodTags(k) {
  const f = k.flags;
  return [
    f.tensha && "天赦日",
    f.ichiryu && "一粒万倍日",
    f.kinoeNe && "甲子の日",
    f.tsuchinotoMi ? "己巳の日" : f.mi && "巳の日",
    f.tora && "寅の日",
    k.rokuyo === "大安" && "大安",
  ].filter(Boolean);
}

/* 凶日の定義 */
function badTags(k) {
  return [k.flags.fujoju && "不成就日", k.rokuyo === "仏滅" && "仏滅"].filter(Boolean);
}

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) throw new Error("日付は YYYY-MM-DD で渡す: " + s);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/* 発売期間の全日を集計する。ここが唯一の計算元 */
function build(ctx, from, to) {
  const days = [];
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear(), m = d.getMonth() + 1, dd = d.getDate();
    const k = ctx.dayKoyomi(y, m, dd);
    const good = goodTags(k);
    const bad = badTags(k);
    days.push({
      y, m, d: dd, w: WEEK[d.getDay()], label: m + "/" + dd,
      rokuyo: k.rokuyo, eto: k.eto, good, bad,
    });
  }

  const n = days.length;
  const kichi = days.filter((x) => x.good.length).length;
  const both = days.filter((x) => x.good.length && x.bad.length).length;
  const multi = days.filter((x) => x.good.length >= 2).length;
  const none = days.filter((x) => !x.good.length && !x.bad.length).length;
  const pct = Math.round((1000 * kichi) / n) / 10;

  return { days, n, kichi, both, multi, none, pct };
}

/* 記事に差し込む <tr>。生成も検算もこの1か所から出す */
function rowHtml(x) {
  const cls = x.good.length >= 2 ? ' class="hit hit--multi"' : x.good.length ? ' class="hit"' : "";
  return (
    "<tr" + cls + '><td class="num">' + x.label + "<small>(" + x.w + ")</small></td>" +
    "<td>" + x.rokuyo + "</td><td>" + x.eto + "</td>" +
    "<td>" + (x.good.length ? x.good.join("・") : "―") + "</td>" +
    '<td class="bad">' + x.bad.join("・") + "</td></tr>"
  );
}

/* 吉日の種類ごとの日付一覧。本文とFAQに書く列挙はここから写す */
function byKind(days) {
  const kinds = {};
  for (const x of days) for (const g of x.good) (kinds[g] = kinds[g] || []).push(x.label);
  return kinds;
}

/* 六曜が飛ぶ日を拾う。旧暦1日でリセットされるため(記事に理由を書く) */
function rokuyoJumps(ctx, days) {
  const ORDER = ["先勝", "友引", "先負", "仏滅", "大安", "赤口"];
  const out = [];
  for (let i = 1; i < days.length; i++) {
    const a = ORDER.indexOf(days[i - 1].rokuyo), b = ORDER.indexOf(days[i].rokuyo);
    if (a < 0 || b < 0) continue;
    if ((a + 1) % 6 === b) continue; // 順送りなら飛んでいない
    const x = days[i];
    const lun = typeof ctx.lunarDate === "function" ? ctx.lunarDate(x.y, x.m, x.d) : null;
    out.push({
      from: days[i - 1].label + " " + days[i - 1].rokuyo,
      to: x.label + " " + x.rokuyo,
      kyureki: lun ? "旧暦" + lun.num + "月" + lun.day + "日" : "(旧暦の取得に失敗)",
    });
  }
  return out;
}

function main() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const has = (k) => a.includes(k);

  const from = parseDate(get("--from"));
  const to = parseDate(get("--to"));
  const drawArg = get("--draw");
  const verify = get("--verify");

  if (to < from) throw new Error("--to が --from より前");

  const ctx = loadKoyomi();
  const r = build(ctx, from, to);
  const rows = r.days.map(rowHtml);

  if (has("--rows")) { console.log(rows.join("\n")); return; }

  if (verify) {
    const p = path.isAbsolute(verify) ? verify : path.join(ROOT, verify);
    const art = fs.readFileSync(p, "utf8");
    let fail = 0;
    const ck = (name, ok) => { if (!ok) { console.log("NG " + name); fail++; } };

    r.days.forEach((x, i) => ck("表の行 " + x.label, art.includes(rows[i])));
    ck("表の行数", (art.match(/<tr[^>]*><td class="num">\d+\/\d+</g) || []).length === r.n);
    ck("発売日数 " + r.n, art.includes('<td class="num">' + r.n + "日</td>"));
    ck("吉日 " + r.kichi + "日(" + r.pct + "%)", art.includes(r.kichi + "日（" + r.pct + "%）"));
    ck("吉凶の同居 " + r.both, art.includes('<td class="num">' + r.both + "日</td>"));
    ck("重なり " + r.multi, art.includes('<td class="num">' + r.multi + "日</td>"));
    ck("吉凶なし " + r.none, art.includes('<td class="num">' + r.none + "日</td>"));

    if (drawArg) {
      const dr = parseDate(drawArg);
      const k = ctx.dayKoyomi(dr.getFullYear(), dr.getMonth() + 1, dr.getDate());
      ck("抽せん日の暦 " + k.eto + "・" + k.rokuyo, art.includes(k.eto + "・" + k.rokuyo));
    }

    /*
     * 本文やFAQで吉日を「◯月◯日、◯月◯日…」と全部列挙している箇所は、計算と一致するか見る。
     * ただし「9月25日と10月7日」のような繋ぎ方もあるので、そろっていない＝間違いとは言えない。
     * ここは落とさずに目視用として出す(落とすと誤検知で検算そのものが信用されなくなる)。
     */
    const kinds = byKind(r.days);
    const memo = [];
    for (const [name, list] of Object.entries(kinds)) {
      const jp = list.map((s) => s.replace("/", "月") + "日").join("、");
      if (art.includes(jp)) { memo.push("  一致 " + name + ": " + jp); continue; }
      if (!art.includes(name)) continue;                 // その吉日に触れていない記事なら見ない
      memo.push("  要目視 " + name + ": " + jp);          // 表にしか出していないなら、これで正常
    }
    if (memo.length) { console.log("[本文の列挙]"); memo.forEach((m) => console.log(m)); }

    console.log(fail ? "FAILED " + fail : "ALL OK  " + r.n + "日 / 吉日" + r.kichi + "(" + r.pct + "%) 同居" + r.both + " 重なり" + r.multi + " なし" + r.none);
    process.exit(fail ? 1 : 0);
  }

  // 生成モード
  const f = (d) => d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate();
  console.log("発売期間 " + f(from) + " 〜 " + f(to) + "  " + r.n + "日間");
  console.log("");
  console.log("吉日        " + r.kichi + "日 (" + r.pct + "%)");
  console.log("うち凶日と同居 " + r.both + "日");
  console.log("吉日が2つ以上  " + r.multi + "日  " + r.days.filter((x) => x.good.length >= 2).map((x) => x.label + "(" + x.good.join("・") + (x.bad.length ? " ただし" + x.bad.join("・") : "") + ")").join(" / "));
  console.log("吉日も凶日もなし " + r.none + "日");
  console.log("");
  console.log("[吉日の種類ごと]");
  for (const [name, list] of Object.entries(byKind(r.days))) {
    console.log("  " + name.padEnd(8) + list.length + "日  " + list.join(" "));
  }
  const jumps = rokuyoJumps(ctx, r.days);
  console.log("");
  console.log("[六曜が飛ぶ日] " + (jumps.length ? "" : "なし"));
  for (const j of jumps) console.log("  " + j.from + " → " + j.to + "  (" + j.kyureki + " でリセット)");

  if (drawArg) {
    const dr = parseDate(drawArg);
    const k = ctx.dayKoyomi(dr.getFullYear(), dr.getMonth() + 1, dr.getDate());
    const g = goodTags(k), b = badTags(k);
    console.log("");
    console.log("[抽せん日] " + f(dr) + "  " + k.eto + "・" + k.rokuyo +
      "  吉:" + (g.join("・") || "なし") + "  凶:" + (b.join("・") || "なし"));
  }

  console.log("");
  console.log("[表の tbody]");
  console.log(rows.join("\n"));
}

main();
