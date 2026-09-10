/*
 * 画面の制御。くじの仕様は games.js、数字の選び方は generate.js。
 * 保存するのは「選んだくじの種類」と「今日の数字」に使う生年月日だけ。
 */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

const STORE = "kuji-maker:prefs";

const selGame = document.getElementById("game");
const selCount = document.getElementById("count");
const gameLead = document.getElementById("game-lead");
const oddsEl = document.getElementById("odds");
const birthField = document.getElementById("birth-field");
const selBYear = document.getElementById("byear");
const selBMonth = document.getElementById("bmonth");
const selBDay = document.getElementById("bday");
const resultEl = document.getElementById("result");
const setsEl = document.getElementById("sets");
const resultTitle = document.getElementById("result-title");
const resultMode = document.getElementById("result-mode");
const buyNote = document.getElementById("buy-note");
const btnGo = document.getElementById("btn-go");
const btnAgain = document.getElementById("btn-again");
const btnCopy = document.getElementById("btn-copy");

let copyText = "";

const MODE_LABEL = { random: "おまかせ", unpopular: "人と被りにくく", lucky: "今日の数字" };

function currentMode() {
  const el = document.querySelector('input[name="mode"]:checked');
  return el ? el.value : "random";
}

/* ---------- 初期化 ---------- */

function fillSelects() {
  for (const key of GAME_ORDER) {
    selGame.appendChild(new Option(GAMES[key].name, key));
  }
  const thisYear = new Date().getFullYear();
  for (let y = thisYear; y >= 1920; y--) selBYear.appendChild(new Option(`${y}年`, y));
  for (let m = 1; m <= 12; m++) selBMonth.appendChild(new Option(`${m}月`, m));
  for (let d = 1; d <= 31; d++) selBDay.appendChild(new Option(`${d}日`, d));
  selBYear.value = String(thisYear - 30);
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function savePrefs() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      game: selGame.value,
      by: selBYear.value, bm: selBMonth.value, bd: selBDay.value,
    }));
  } catch (e) { /* 保存できなくても動作には影響しない */ }
}

/* ---------- くじの説明・確率 ---------- */

function syncGame() {
  const g = GAMES[selGame.value];
  gameLead.textContent = g.lead;
  const total = g.total();
  oddsEl.textContent = `${g.name}は${g.totalLabel}が ${total.toLocaleString()} 通り。1口 ${g.price}円・${g.day}に抽せん。`;
}

function syncMode() {
  birthField.hidden = currentMode() !== "lucky";
}

/* ---------- 結果の描画 ---------- */

function ballsHtml(nums, max) {
  return `<div class="balls">${nums.map((n) => {
    const high = max > 31 && n > 31;
    return `<span class="ball${high ? " ball--high" : ""}">${String(n).padStart(2, "0")}</span>`;
  }).join("")}</div>`;
}

function digitsHtml(digits) {
  return `<div class="digits">${digits.map((d) => `<span class="digit">${d}</span>`).join("")}</div>`;
}

function bingoHtml(cells) {
  return `<div class="bingo">${cells.map((v) => (
    v === null
      ? '<span class="bingo__cell bingo__cell--free">FREE</span>'
      : `<span class="bingo__cell">${v}</span>`
  )).join("")}</div>`;
}

function marksHtml(marks) {
  return `<div class="marks">${marks.map((m, i) => (
    `<span class="mark"><span class="mark__i">${i + 1}</span><span class="mark__v">${m}</span></span>`
  )).join("")}</div>`;
}

function notesHtml(notes) {
  if (!notes || !notes.length) return "";
  return `<ul class="set__notes">${notes.map((n) => (
    `<li class="${n.good ? "is-good" : "is-bad"}">${escapeHtml(n.text)}</li>`
  )).join("")}</ul>`;
}

function setHtml(set, index, game, mode) {
  let body = "";
  if (set.kind === "choose") body = ballsHtml(set.nums, game.max);
  else if (set.kind === "digits") body = digitsHtml(set.digits);
  else if (set.kind === "bingo") body = bingoHtml(set.cells);
  else body = marksHtml(set.marks);

  let meta = "";
  if (set.kind === "choose") {
    const s = set.sum;
    meta = `<p class="set__meta">合計 ${s.sum}(まん中あたりは ${s.center})</p>`;
  }
  // 「人と被りにくく」を選んだときだけ、判定の中身を見せる
  const notes = mode === "unpopular" ? notesHtml(set.notes) : "";

  return `<div class="set">
    <span class="set__no">${index + 1}口目</span>
    ${body}
    ${meta}
    ${notes}
  </div>`;
}

function buildCopyText(sets, game, mode) {
  const head = `【${game.name}】${MODE_LABEL[mode]}`;
  const lines = sets.map((s, i) => `${i + 1}口目: ${s.text}`);
  return [head, ...lines, "", "くじ番号メーカー https://kuji-maker.github.io/"].join("\n");
}

function run() {
  const key = selGame.value;
  const game = GAMES[key];
  const mode = currentMode();
  // 不正な値でも無言で0口にしない(空の結果が出て原因が分からなくなる)
  const count = Math.max(1, Math.min(10, Number(selCount.value) || 1));

  const seed = mode === "lucky"
    ? `${selBYear.value}-${selBMonth.value}-${selBDay.value}|${new Date().toDateString()}|${key}`
    : "";

  const sets = generateSets(key, mode, count, seed);

  resultTitle.textContent = `${game.name} の数字`;
  resultMode.textContent = MODE_LABEL[mode];
  setsEl.innerHTML = sets.map((s, i) => setHtml(s, i, game, mode)).join("");
  copyText = buildCopyText(sets, game, mode);

  buyNote.innerHTML = game.sports
    ? "サッカーの結果はランダムではないので、この並びに根拠はありません。試合を見て決めた方が確実です。"
    : `${game.totalLabel}は ${game.total().toLocaleString()} 通り。その中の1通りを選んでいます。どの選び方でも、当たる確率は同じです。`;

  resultEl.hidden = false;
  savePrefs();
  resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- イベント ---------- */

selGame.addEventListener("change", () => { syncGame(); savePrefs(); });
document.getElementById("modes").addEventListener("change", syncMode);
btnGo.addEventListener("click", run);
btnAgain.addEventListener("click", run);

btnCopy.addEventListener("click", async () => {
  // 共有APIはクリック直後にしか呼べないので、ここで分岐する
  if (navigator.share) {
    try {
      await navigator.share({ text: copyText });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // ユーザーがキャンセル
    }
  }
  try {
    await navigator.clipboard.writeText(copyText);
    btnCopy.textContent = "コピーしました";
    setTimeout(() => { btnCopy.textContent = "コピー"; }, 2000);
  } catch (e) {
    btnCopy.textContent = "コピーできませんでした";
  }
});

/* ---------- 解説の一覧表 ---------- */

function fillSpecTable() {
  const rows = GAME_ORDER.map((key) => {
    const g = GAMES[key];
    let how;
    if (g.kind === "choose") how = `1〜${g.max}から${g.pick}個`;
    else if (g.kind === "digits") how = `${g.digits}桁(0〜9)`;
    else if (g.kind === "bingo") how = "3×3の8マス";
    else how = `${g.matches}試合の勝敗`;
    return `<tr>
      <th>${escapeHtml(g.name)}</th>
      <td>${escapeHtml(how)}</td>
      <td class="num">${g.price}円</td>
      <td class="num">${g.total().toLocaleString()}通り</td>
      <td>${escapeHtml(g.day)}</td>
    </tr>`;
  }).join("");
  document.querySelector("#spec-table tbody").innerHTML =
    `<tr><th>くじ</th><td>選び方</td><td class="num">1口</td><td class="num">全通り</td><td>抽せん</td></tr>${rows}`;
  document.getElementById("not-supported").textContent = NOT_SUPPORTED;
}

/* ---------- 起動 ---------- */

fillSelects();
const prefs = loadPrefs();
if (prefs) {
  if (prefs.game && GAMES[prefs.game]) selGame.value = prefs.game;
  if (prefs.by) { selBYear.value = prefs.by; selBMonth.value = prefs.bm; selBDay.value = prefs.bd; }
}
syncGame();
syncMode();
fillSpecTable();
