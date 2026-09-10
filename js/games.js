/*
 * くじの仕様。数字を選ぶタイプの宝くじと、スポーツくじ。
 *
 * ★ 確率は必ずこのファイルの中で計算する ★
 * 「約609万分の1」のような数字を手で書くと、写し間違えても誰も気づけない。
 * 組み合わせの数は数学的に決まるので、combinations() で出して表示する。
 * 一方で当せん金額は回ごとに変わるため、このアプリでは扱わない(みずほ銀行の公式へ誘導する)。
 */

/* nCk。途中で小数を挟むが、この規模(最大でも1000万台)なら誤差は出ない */
function combinations(n, k) {
  let r = 1;
  for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
  return Math.round(r);
}

const GAMES = {
  loto7: {
    name: "ロト7",
    kind: "choose",
    pick: 7,
    max: 37,
    price: 300,
    day: "毎週金曜日",
    lead: "1〜37の中から7個を選びます。数字選択式では一番大きな当せん金が狙えるくじ。",
    total: () => combinations(37, 7),
    totalLabel: "7個すべて当てる組み合わせ",
  },
  loto6: {
    name: "ロト6",
    kind: "choose",
    pick: 6,
    max: 43,
    price: 200,
    day: "毎週月曜日・木曜日",
    lead: "1〜43の中から6個を選びます。数字選択式でもっとも歴史が長く、口数も多いくじ。",
    total: () => combinations(43, 6),
    totalLabel: "6個すべて当てる組み合わせ",
  },
  miniloto: {
    name: "ミニロト",
    kind: "choose",
    pick: 5,
    max: 31,
    price: 200,
    day: "毎週火曜日",
    lead: "1〜31の中から5個を選びます。当たる確率は数字選択式の中でいちばん高め。",
    total: () => combinations(31, 5),
    totalLabel: "5個すべて当てる組み合わせ",
  },
  numbers4: {
    name: "ナンバーズ4",
    kind: "digits",
    digits: 4,
    price: 200,
    day: "毎週月〜金曜日",
    lead: "0000〜9999から4桁を選びます。並び順まで当てる「ストレート」、順番不問の「ボックス」などの申込タイプがあります。",
    total: () => 10000,
    totalLabel: "ストレートの組み合わせ",
    types: ["ストレート(並び順まで一致)", "ボックス(順番は不問)", "セット(ストレートとボックスに半分ずつ)"],
  },
  numbers3: {
    name: "ナンバーズ3",
    kind: "digits",
    digits: 3,
    price: 200,
    day: "毎週月〜金曜日",
    lead: "000〜999から3桁を選びます。下2桁だけを狙う「ミニ」もあります。",
    total: () => 1000,
    totalLabel: "ストレートの組み合わせ",
    types: ["ストレート(並び順まで一致)", "ボックス(順番は不問)", "セット(ストレートとボックスに半分ずつ)", "ミニ(下2桁のみ)"],
  },
  bingo5: {
    name: "ビンゴ5",
    kind: "bingo",
    price: 200,
    day: "毎週水曜日",
    lead: "3×3のマスの、中央以外の8マスにそれぞれ数字を1つ選びます。マスごとに選べる数字の範囲が決まっていて、縦・横・斜めの列がそろうと当せん。",
    total: () => Math.pow(5, 8),
    totalLabel: "8マスすべての組み合わせ",
    /* マスごとの範囲。中央(index 4)はFREE */
    cells: [[1, 5], [6, 10], [11, 15], [16, 20], null, [21, 25], [26, 30], [31, 35], [36, 40]],
  },
  toto: {
    name: "toto",
    kind: "toto",
    matches: 13,
    price: 100,
    day: "主に土曜日・日曜日",
    lead: "13試合それぞれの結果を、ホーム勝ち(1)・引き分け(0)・アウェイ勝ち(2)から選びます。",
    total: () => Math.pow(3, 13),
    totalLabel: "13試合すべての組み合わせ",
    sports: true,
  },
  minitoto: {
    name: "mini toto",
    kind: "toto",
    matches: 5,
    price: 100,
    day: "主に土曜日・日曜日",
    lead: "5試合それぞれの結果を、ホーム勝ち(1)・引き分け(0)・アウェイ勝ち(2)から選びます。",
    total: () => Math.pow(3, 5),
    totalLabel: "5試合すべての組み合わせ",
    sports: true,
  },
};

const GAME_ORDER = ["loto6", "loto7", "miniloto", "numbers3", "numbers4", "bingo5", "toto", "minitoto"];

/*
 * BIG・MEGA BIGは「自分で数字を選べない」くじ。
 * コンピュータが自動で組み合わせを決めるので、このアプリの対象外。
 * よく一緒にされるので、画面で説明しておく。
 */
const NOT_SUPPORTED = "BIG・MEGA BIG・100円BIGは、コンピュータが自動で組み合わせを決めるくじで、自分では数字を選べません。そのためこのアプリでは扱っていません。";
