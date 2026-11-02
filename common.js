// 公開ページ（site/index.html）と管理画面（manage.html）で共有する処理。
// 時間の書き方・差の色・上の箱・差の色ごとの数・絞り込み・表（カップごとの見出しつき）を作る。
// ページは view（並べ替え・絞り込み・開いている行）を持ち、変わったら NITA.render… を呼び直す。
const NITA = (() => {
  function fmt(ms) {  // ミリ秒 → 1:39.332（1 時間を超えたら 1:02:03.456）
    if (ms === null || ms === undefined) return "";
    const neg = ms < 0; ms = Math.abs(ms);
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60, f = ms % 1000;
    const body = (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0") + "." + String(f).padStart(3, "0");
    return (neg ? "-" : "") + body;
  }
  function fmtDiff(ms) {  // 差 → +0.791 / -0.123 / +1:02.345
    if (ms === null || ms === undefined) return "";
    const a = Math.abs(ms), sign = ms > 0 ? "+" : ms < 0 ? "-" : "±";
    const text = a >= 60000 ? fmt(a) : (Math.floor(a / 1000) + "." + String(a % 1000).padStart(3, "0"));
    return sign + text;
  }
  function fmtPct(p) {
    if (p === null || p === undefined) return "";
    return (p > 0 ? "+" : p < 0 ? "-" : "±") + Math.abs(p).toFixed(2) + "%";
  }
  function fmtDate(d) { return d ? d.replaceAll("-", "/") : ""; }
  function diffClass(diff) {  // WR との差の秒で色を分ける
    if (diff === null || diff === undefined) return "";
    if (diff < 1000) return "near";  // +0.999 まで（WR 以上も）
    if (diff < 2000) return "good";  // +1.000〜+1.999
    if (diff < 3000) return "mid";   // +2.000〜+2.999
    return "far";                    // +3.000 以上
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])); }
  function cupImg(i) { return "images/cup/" + String(i).padStart(2, "0") + ".png"; }
  const NONE = '<span class="none">—</span>';

  // ---------- 上の 4 つの箱 ----------
  function summaryHtml(state) {
    const t = state.total;
    const all = state.courses.length;
    const entered = state.courses.filter((c) => c.pb !== null).length;
    const ratio = entered / all;
    // 進むほど色が変わるバー：グラデーションの幅を通り道全体に固定し、今の長さの所までだけ見せる
    const bar = ratio > 0
      ? `<div class="progress"><div style="width: ${(ratio * 100).toFixed(2)}%; background-size: ${(100 / ratio).toFixed(2)}% 100%"></div></div>`
      : '<div class="progress"></div>';
    const diff = t.count ? t.pb - t.wr : null;
    return `
      <div class="box"><span class="label">自己ベスト入力済み</span>
        <b class="num">${entered}<small> / ${all} コース</small></b>${bar}</div>
      <div class="box"><span class="label">自己ベスト合計</span><b class="num">${t.count ? fmt(t.pb) : "—"}</b></div>
      <div class="box"><span class="label">WR 合計</span><b class="num">${t.count ? fmt(t.wr) : "—"}</b></div>
      <div class="box"><span class="label">差の合計</span>
        <b class="num">${t.count ? fmtDiff(diff) + `<small>　${fmtPct(diff / t.wr * 100)}</small>` : "—"}</b></div>`;
  }

  // ---------- 差の色ごとの数 ----------
  const KINDS = [["near", "1 秒未満"], ["good", "1 秒台"], ["mid", "2 秒台"], ["far", "3 秒以上"]];
  function legendHtml(state) {
    const count = { near: 0, good: 0, mid: 0, far: 0 };
    for (const c of state.courses) if (c.diff !== null) count[diffClass(c.diff)]++;
    const keys = KINDS.map(([k, label]) => `<span><span class="${k}">■</span> ${label}　<b class="num">${count[k]}</b></span>`).join("");
    const bar = KINDS.filter(([k]) => count[k]).map(([k]) => `<div class="bg-${k}" style="flex: ${count[k]}"></div>`).join("");
    return `<div class="keys"><span>WR との差</span>${keys}</div><div class="bar" aria-hidden="true">${bar}</div>`;
  }

  // ---------- 絞り込み ----------
  function newView() {
    return {
      sortKey: "index", sortDesc: false,
      cupFilter: null,   // 絞り込むカップの番号（null ならすべて）
      onlyEmpty: false,  // 自己ベスト未入力のコースだけ
      search: "",
      openAbbr: null,    // 履歴を開いているコース
    };
  }

  // box の中に、すべて・カップの紋章・未入力のみ・コース名で探す を作る（最初の 1 回だけ）。
  // 押されたら view を変えて onChange() を呼ぶ
  function renderFilters(box, state, view, onChange) {
    if (!box.dataset.built) {
      box.dataset.built = "1";
      box.innerHTML = `<button class="btn all">すべて</button>` +
        state.cups.map((cup, i) => `<button class="cupbtn" data-cup="${i}" title="${esc(cup.ja)}" aria-label="${esc(cup.ja)}"><img src="${cupImg(i)}" alt=""></button>`).join("") +
        `<span class="spacer"></span><label><input type="checkbox" class="only-empty"> <span>未入力のみ</span></label>` +
        `<input type="search" class="field search" placeholder="コース名で探す" aria-label="コース名で探す">`;
      box.querySelector(".all").onclick = () => { view.cupFilter = null; onChange(); };
      box.querySelectorAll(".cupbtn").forEach((b) => b.onclick = () => {
        const n = Number(b.dataset.cup);
        view.cupFilter = view.cupFilter === n ? null : n;
        onChange();
      });
      box.querySelector(".only-empty").onchange = (e) => { view.onlyEmpty = e.target.checked; onChange(); };
      box.querySelector(".search").oninput = (e) => { view.search = e.target.value.trim().toLowerCase(); onChange(); };
    }
    box.querySelector(".all").classList.toggle("on", view.cupFilter === null);
    box.querySelectorAll(".cupbtn").forEach((b) => b.classList.toggle("on", Number(b.dataset.cup) === view.cupFilter));
  }

  function visibleCourses(state, view) {
    const q = view.search;
    const list = state.courses.filter((c) =>
      (view.cupFilter === null || c.cup === view.cupFilter) &&
      (!view.onlyEmpty || c.pb === null) &&
      (!q || c.ja.toLowerCase().includes(q) || c.en.toLowerCase().includes(q) || c.abbr.toLowerCase().includes(q)));
    const key = view.sortKey;
    list.sort((a, b) => {
      const x = a[key], y = b[key];
      if (x === null && y === null) return a.index - b.index;
      if (x === null) return 1;   // 値のないコースはいつも下に
      if (y === null) return -1;
      const d = x < y ? -1 : x > y ? 1 : 0;
      return (view.sortDesc ? -d : d) || a.index - b.index;
    });
    return list;
  }

  // ---------- 表 ----------
  // 列：コース・自己ベスト・WR・差・差（%）・差の横棒・PB 更新日・WR 更新日（＋ページが足す列）
  const COLUMNS = [
    { key: "index", label: "コース" },
    { key: "pb", label: "自己ベスト", cls: "r" },
    { key: "wr", label: "WR", cls: "r" },
    { key: "diff", label: "差", cls: "r" },
    { key: "pct", label: "差（%）", cls: "r wide" },
    { key: null, label: "", cls: "wide" },  // 差の横棒
    { key: "pb_date", label: "PB 更新日", cls: "wide" },
    { key: "wr_since", label: "WR 更新日", cls: "wide" },
  ];

  function headHtml(view, extraColumns = []) {
    return `<div class="tr thead">` + [...COLUMNS, ...extraColumns].map((col) => {
      if (!col.key) return `<span class="nosort ${col.cls || ""}">${col.label}</span>`;
      const sorted = col.key === view.sortKey;
      const mark = sorted ? ` <span class="mark">${view.sortDesc ? "▼" : "▲"}</span>` : "";
      return `<span class="${col.cls || ""}${sorted ? " sorted" : ""}" data-key="${col.key}">${col.label}${mark}</span>`;
    }).join("") + `</div>`;
  }

  function wrGain(c) {  // 前回の WR から縮んだ秒（-0.120）。WR 更新日の横に出す
    if (c.wr_gain === null || c.wr_gain === undefined) return "";
    return `<span class="wr-gain" title="前回の WR：${fmt(c.wr + c.wr_gain)}">${fmtDiff(-c.wr_gain)}</span>`;
  }

  function rowHtml(c, view, opts) {
    const cls = diffClass(c.diff);
    const open = c.abbr === view.openAbbr;
    const bar = c.diff !== null
      ? `<div class="bg-${cls}" style="width: ${Math.max(3, Math.min(100, c.diff / 45))}%"></div>` : "";  // 4.5 秒で満杯
    let html = `<div class="tr row${open ? " open" : ""}${opts.rowClass ? " " + opts.rowClass(c) : ""}" data-abbr="${esc(c.abbr)}">
      <div class="course"><img class="wide" src="images/course/${esc(c.abbr)}.png" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="names"><span>${esc(c.ja)}</span><span class="en wide">${esc(c.en)}</span></div></div>
      <span class="num time r">${c.pb !== null ? fmt(c.pb) : NONE}</span>
      <span class="num time wr r">${c.wr !== null ? fmt(c.wr) : NONE}</span>
      <span class="num diff r ${cls}">${c.diff !== null ? (c.diff <= 0 ? "WR 以上" : fmtDiff(c.diff)) : ""}</span>
      <span class="num small r wide ${cls}">${fmtPct(c.pct)}</span>
      <div class="gapbar wide" aria-hidden="true">${bar}</div>
      <span class="num small sub wide">${fmtDate(c.pb_date)}</span>
      <span class="num small sub wide">${c.wr_since ? fmtDate(c.wr_since) : NONE}${wrGain(c)}</span>
      ${opts.extraCells ? opts.extraCells(c) : ""}
    </div>`;
    if (open && opts.detail) html += `<div class="detail">${opts.detail(c)}</div>`;
    return html;
  }

  function cupHeadText(state, cup) {  // カップの見出しの数：差の合計（そろっていなければ入力済みの数）
    const courses = state.courses.filter((c) => c.cup === cup);
    const entered = courses.filter((c) => c.pb !== null).length;
    const diffs = courses.filter((c) => c.diff !== null);  // WR が取り込めていないコースは差がない
    return diffs.length === courses.length
      ? "差の合計 " + fmtDiff(diffs.reduce((a, c) => a + c.diff, 0))
      : `入力済み ${entered} / ${courses.length}`;
  }

  function cupHeadHtml(state, cup) {  // カップの見出し：紋章・カップ名・差の合計（未入力があれば入力済みの数）
    const sum = cupHeadText(state, cup);
    return `<div class="cuphead"><img src="${cupImg(cup)}" alt=""><span class="name">${esc(state.cups[cup].ja)}</span><span class="num sum">${sum}</span></div>`;
  }

  // 表の中身。「コース」の順のときはカップごとに見出しを付け、ほかの列で並べ替えたときは 1 本の表にする
  function rowsHtml(state, view, opts = {}) {
    const list = visibleCourses(state, view);
    if (!list.length) return '<div class="empty">当てはまるコースがありません。</div>';
    if (view.sortKey !== "index") return list.map((c) => rowHtml(c, view, opts)).join("");
    let html = "", cup = null;
    for (const c of list) {
      if (c.cup !== cup) {
        cup = c.cup;
        html += cupHeadHtml(state, cup);
      }
      html += rowHtml(c, view, opts);
    }
    return html;
  }

  // 見出しを押したら並べ替える
  function bindHead(container, view, onChange) {
    container.querySelectorAll(".thead [data-key]").forEach((el) => el.onclick = () => {
      const key = el.dataset.key;
      if (view.sortKey === key) view.sortDesc = !view.sortDesc;
      else { view.sortKey = key; view.sortDesc = key === "diff" || key === "pct"; }  // 差は大きい順から
      onChange();
    });
  }

  // 自己ベストの履歴（新しい順）。extra(h) で行の後ろに足す（管理画面の「消す」）
  function historyHtml(c, extra) {
    if (!c.history.length) return '<div class="sub">まだ記録がありません。</div>';
    const rows = [...c.history].reverse().map((h) => `
      <tr class="${h.time === c.pb ? "best" : ""}">
        <td class="num sub">${fmtDate(h.date)}</td>
        <td class="num r">${fmt(h.time)}</td>
        <td class="num r ${h.gain > 0 ? "good" : "sub"}">${h.gain === null ? "初記録" : h.gain > 0 ? "-" + fmtDiff(h.gain).slice(1) : "更新なし"}</td>
        ${extra ? `<td>${extra(h)}</td>` : ""}
      </tr>`).join("");
    return `<table class="history"><tr><th>日付</th><th class="r">タイム</th><th class="r">縮めた秒</th>${extra ? "<th></th>" : ""}</tr>${rows}</table>`;
  }

  return {
    fmt, fmtDiff, fmtPct, fmtDate, diffClass, esc, cupImg,
    summaryHtml, legendHtml, newView, renderFilters, visibleCourses,
    headHtml, rowsHtml, cupHeadText, bindHead, historyHtml,
  };
})();
