const CSV_FILE = "data_ggsheet_data.csv";
const TOTAL = 12;

const TITLES = {
  1: "Doanh số theo Mặt hàng",
  2: "Doanh số theo Nhóm hàng",
  3: "Doanh số theo Tháng",
  4: "Doanh số TB theo Ngày trong tuần",
  5: "Doanh số TB theo Ngày trong tháng",
  6: "Doanh số TB theo Khung giờ",
  7: "Xác suất bán hàng theo Nhóm hàng",
  8: "Xác suất bán hàng của Nhóm hàng theo Tháng",
  9: "Xác suất bán hàng của Mặt hàng theo Nhóm hàng",
  10: "Xác suất bán hàng theo Nhóm hàng & Tháng",
  11: "Phân phối Lượt mua hàng",
  12: "Phân phối Mức chi trả của Khách hàng",
};

const chart = d3.select("#chart");
const tip = d3.select("#tt");
const titleEl = d3.select("#chartTitle");

function setTitle(i) {
  const t = TITLES[i] || `Q${i}`;
  titleEl.text(t);
  document.title = `${t} • Dashboard Q1–Q12`;
}

// CSV cache
let _rowsCache = null;
async function loadCSV() {
  if (_rowsCache) return _rowsCache;
  const raw = await d3.text(CSV_FILE);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  _rowsCache = d3.dsvFormat(sep).parse(raw);
  return _rowsCache;
}

const toNumber = v => +String(v ?? "").replace(/[^\d.-]/g, "");
const fmtInt = v => d3.format(",.0f")(v);

/* ====== NAV (Q1..Q12) ====== */
const nav = document.getElementById("nav");
const btns = [];
for (let i = 1; i <= TOTAL; i++) {
  const b = document.createElement("button");
  b.className = "q";
  b.textContent = "Q" + i;
  b.dataset.q = i;
  b.onclick = () => showQ(i, true);
  nav.insertBefore(b, nav.querySelector(".spacer"));
  btns.push(b);
}
function setActive(i) {
  btns.forEach(b => b.classList.toggle("active", +b.dataset.q === +i));
}
function initQFromHash() {
  const h = (location.hash || "").toUpperCase();
  const m = h.match(/^#Q(\d{1,2})$/);
  if (m) return Math.min(TOTAL, Math.max(1, +m[1]));
  const saved = +localStorage.getItem("lastQ") || 1;
  return Math.min(TOTAL, Math.max(1, saved));
}

/* ====== ROUTER ====== */
async function showQ(i, pushHash = false) {
  setActive(i);
  setTitle(i);
  if (pushHash) history.replaceState(null, "", "#Q" + i);
  localStorage.setItem("lastQ", i);

  // xoá nội dung cũ (trừ tiêu đề)
  chart.selectAll("svg, .gridwrap, .subplot, .note").remove();

  const rows = await loadCSV();
  const render = RENDERERS[i];
  if (render) {
    try { await render(rows); }
    catch (e) {
      console.error(e);
      chart.append("div").attr("class", "note")
        .style("color", "crimson")
        .style("textAlign", "center")
        .text("Có lỗi khi vẽ biểu đồ.");
    }
  } else {
    chart.append("div").attr("class", "note").text("Chưa có renderer cho Q" + i);
  }
}

window.addEventListener("hashchange", () => showQ(initQFromHash(), false));
window.addEventListener("keydown", (e) => {
  const cur = +localStorage.getItem("lastQ") || 1;
  if (e.key === "ArrowRight") showQ(Math.min(TOTAL, cur + 1), true);
  if (e.key === "ArrowLeft")  showQ(Math.max(1, cur - 1), true);
});

// Khởi động
showQ(initQFromHash(), false);

/* ====== RENDERERS (Q1..Q12) ====== */
/* Lưu ý: tất cả vẽ vào #chart và dùng tip (#tt) đã có trong index.html */

const RENDERERS = {
  1: renderQ1,
  2: renderQ2,
  3: renderQ3,
  4: renderQ4,
  5: renderQ5,
  6: renderQ6,
  7: renderQ7,
  8: renderQ8,
  9: renderQ9,
  10: renderQ10,
  11: renderQ11,
  12: renderQ12,
};

/* ---------- Q1 – Doanh số theo Mặt hàng ---------- */
async function renderQ1(rows) {
  const TOP_N = 20;

  const mapped = rows.map(r => {
    const maMH  = (r["Mã mặt hàng"]   ?? "").trim();
    const tenMH = (r["Tên mặt hàng"]  ?? "").trim();
    const maNH  = (r["Mã nhóm hàng"]  ?? "").trim();
    const tenNH = (r["Tên nhóm hàng"] ?? "").trim();
    const money = toNumber(r["Thành tiền"]);
    const qty   = toNumber(r["SL"]);
    return {
      itemKey: maMH,
      item: `[${maMH}] ${tenMH}`,
      group: `[${maNH}] ${tenNH}`,
      value: money,
      qty: Number.isFinite(qty) ? qty : null
    };
  }).filter(d => d.itemKey && d.item && d.group && Number.isFinite(d.value));

  const agg = Array.from(
    d3.rollups(
      mapped,
      v => ({
        value: d3.sum(v, d => d.value),
        qty  : (v.some(d => d.qty != null) ? d3.sum(v, d => d.qty || 0) : null),
        group: d3.mode(v.map(d => d.group)) || v[0].group,
        item : v[0].item
      }),
      d => d.itemKey
    ),
    ([, o]) => ({ item: o.item, group: o.group, value: o.value, qty: o.qty })
  ).sort((a,b)=>d3.descending(a.value,b.value));

  const data = TOP_N > 0 ? agg.slice(0, TOP_N) : agg;

  const groups = [...new Set(data.map(d => d.group))];

  const meas = d3.select("body").append("svg")
    .attr("width", 0).attr("height", 0)
    .style("position", "absolute").style("visibility", "hidden");
  let maxTextW = 0;
  groups.forEach(s => {
    const t = meas.append("text").attr("font-size", 12).text(s);
    const w = t.node().getComputedTextLength();
    maxTextW = Math.max(maxTextW, w);
    t.remove();
  });
  meas.remove();

  const margin = { top: 10, right: 300, bottom: 10, left: 260 };
  const barH = 26, gap = 6;

  const containerW = Math.max(1000, Math.floor(chart.node().getBoundingClientRect().width) || 1000);
  const width = containerW;
  const height = margin.top + margin.bottom + data.length * barH;

  const fmtVNDTrieu = v => d3.format(",.0f")(v / 1e6) + " triệu VND";

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.value)]).nice()
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.item))
    .range([margin.top, height - margin.bottom])
    .paddingInner(gap / barH);

  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(groups);

  const svg = chart.append("svg").attr("width", width).attr("height", height);

  svg.append("g")
    .attr("transform", `translate(0,${margin.top})`)
    .call(d3.axisTop(x).ticks(6)
      .tickSize(-(height - margin.top - margin.bottom))
      .tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke", "#000").attr("stroke-opacity", 0.06);

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove());

  svg.append("g").selectAll("rect")
    .data(data).join("rect")
      .attr("x", x(0))
      .attr("y", d => y(d.item))
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.value) - x(0))
      .attr("fill", d => color(d.group))
      .on("pointerenter", (event, d) => {
        const html =
          `<div><b>Mặt hàng:</b> <span class="v">${d.item}</span></div>
           <div><b>Nhóm hàng:</b> <span class="v">${d.group}</span></div>
           <div><b>Doanh số bán:</b> <span class="v">${fmtVNDTrieu(d.value)}</span></div>
           <div class="sub">Số lượng bán: ${fmtInt(d.qty || 0)} SKUs</div>`;
        tip.html(html).style("opacity", 1);
      })
      .on("pointermove", (event) => {
        const pad = 12;
        tip.style("left", (event.clientX + pad) + "px").style("top", (event.clientY + pad) + "px");
      })
      .on("pointerleave", () => tip.style("opacity", 0));

  svg.append("g").selectAll("text.value")
    .data(data).join("text")
      .attr("class", "value")
      .attr("x", d => Math.min(x(d.value) + 6, width - margin.right - 4))
      .attr("y", d => y(d.item) + y.bandwidth() / 2)
      .attr("dy", ".35em")
      .attr("font-size", 12).attr("fill", "#333")
      .text(d => fmtVNDTrieu(d.value));

  // Legend
  const legend = svg.append("g").attr("transform", `translate(${width - margin.right + 20}, ${margin.top})`);
  const itemH = 24;
  const items = legend.selectAll("g.item").data(color.domain()).join("g")
    .attr("class", "item").attr("transform", (d,i)=>`translate(0, ${i*itemH})`);
  items.append("rect").attr("width",14).attr("height",14).attr("rx",2).attr("fill",d=>color(d));
  items.append("text").attr("x",20).attr("y",7).attr("dominant-baseline","middle").attr("font-size",12).text(d=>d);

  const pad = 8, bbox = legend.node().getBBox();
  legend.insert("rect",":first-child")
    .attr("x", bbox.x - pad).attr("y", bbox.y - pad)
    .attr("width", bbox.width + pad*2).attr("height", bbox.height + pad*2)
    .attr("fill","#fff").attr("stroke","#e5e7eb").attr("rx",6).attr("opacity",0.98);
}

/* ---------- Q2 – Doanh số theo Nhóm hàng ---------- */
async function renderQ2(rows) {
  const fmtVNDTrieu = v => d3.format(",.0f")(v/1e6) + " triệu VND";

  const mapped = rows.map(r => {
    const maNH  = (r["Mã nhóm hàng"]  ?? "").trim();
    const tenNH = (r["Tên nhóm hàng"] ?? "").trim();
    return {
      groupKey: maNH,
      group   : `[${maNH}] ${tenNH}`,
      value   : toNumber(r["Thành tiền"]),
      qty     : Number.isFinite(toNumber(r["SL"])) ? toNumber(r["SL"]) : null
    };
  }).filter(d => d.groupKey && d.group && Number.isFinite(d.value));

  const agg = Array.from(
    d3.rollups(
      mapped,
      v => ({
        value: d3.sum(v, d => d.value),
        qty  : v.some(d => d.qty != null) ? d3.sum(v, d => d.qty || 0) : null,
        group: v[0].group
      }),
      d => d.groupKey
    ),
    ([, o]) => ({ group: o.group, value: o.value, qty: o.qty })
  ).sort((a,b)=>d3.descending(a.value,b.value));

  const margin = { top: 20, right: 220, bottom: 20, left: 220 };
  const barH = 34, gap = 8;
  const width = Math.max(1000, chart.node().clientWidth || 1000);
  const height = margin.top + margin.bottom + agg.length * barH;

  const x = d3.scaleLinear()
    .domain([0, d3.max(agg, d => d.value)]).nice()
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(agg.map(d => d.group))
    .range([margin.top, height - margin.bottom])
    .paddingInner(gap / barH);

  const color = d3.scaleOrdinal(d3.schemeTableau10).domain(agg.map(d=>d.group));

  const svg = chart.append("svg").attr("width",width).attr("height",height);

  svg.append("g")
    .attr("transform", `translate(0,${margin.top})`)
    .call(d3.axisTop(x).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke","#000").attr("stroke-opacity",0.06);

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove());

  svg.append("g").selectAll("rect")
    .data(agg).join("rect")
      .attr("x", x(0))
      .attr("y", d => y(d.group))
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.value) - x(0))
      .attr("fill", d => color(d.group))
      .on("pointerenter", (event, d) => {
        const html =
          `<div><b>Nhóm hàng:</b> <span class="v">${d.group}</span></div>
           <div><b>Doanh số bán:</b> <span class="v">${fmtVNDTrieu(d.value)}</span></div>` +
          (d.qty != null ? `<div class="sub">Số lượng bán: ${fmtInt(d.qty)} SKUs</div>` : "");
        tip.html(html).style("opacity", 1);
      })
      .on("pointermove", (event) => {
        const pad = 12;
        tip.style("left", (event.clientX + pad) + "px").style("top", (event.clientY + pad) + "px");
      })
      .on("pointerleave", () => tip.style("opacity", 0));

  svg.append("g").selectAll("text.value")
    .data(agg).join("text")
      .attr("class","value")
      .attr("x", d => x(d.value) + 6)
      .attr("y", d => y(d.group) + y.bandwidth()/2)
      .attr("dy",".35em").attr("font-size",12).attr("fill","#333")
      .text(d => fmtVNDTrieu(d.value));
}

/* ---------- Q3 – Doanh số theo Tháng ---------- */
async function renderQ3(rows) {
  const DATE_COL  = "Thời gian tạo đơn";
  const VALUE_COL = "Thành tiền";

  const pYMDHMS = d3.timeParse("%Y-%m-%d %H:%M:%S");
  const pYMD    = d3.timeParse("%Y-%m-%d");
  const pDMY    = d3.timeParse("%d/%m/%Y");
  const pMDY    = d3.timeParse("%m/%d/%Y");
  const fromExcelSerial = n => new Date(Math.round((+n - 25569) * 86400000) + 12*3600*1000);
  function parseDateCell(v) {
    if (v == null || v === "") return null;
    if (!isNaN(v) && v !== true && v !== false) {
      const num = +v; if (num > 10000) return fromExcelSerial(num);
    }
    const s = String(v).trim();
    return pYMDHMS(s) || pYMD(s) || pDMY(s) || pMDY(s) || null;
  }

  const mapped = rows.map(r => {
    const dt  = parseDateCell(r[DATE_COL]);
    const m   = dt ? +d3.timeFormat("%m")(dt) : null;
    const val = toNumber(r[VALUE_COL]);
    const qty = toNumber(r["SL"]);
    return { m, value: val, qty: Number.isFinite(qty) ? qty : null };
  }).filter(d => d.m && Number.isFinite(d.value) && d.value > 0);

  const rolled = d3.rollups(
    mapped,
    v => ({
      value: d3.sum(v, d => d.value),
      qty  : v.some(d => d.qty != null) ? d3.sum(v, d => d.qty || 0) : null
    }),
    d => d.m
  );
  const byMonth = new Map(rolled.map(([m, o]) => [m, o]));
  const data = d3.range(1, 13).map(m => ({
    m,
    value: (byMonth.get(m)?.value) || 0,
    qty  : (byMonth.get(m)?.qty ?? null)
  }));

  const margin = { top: 60, right: 30, bottom: 50, left: 70 };
  const width  = Math.max(1000, chart.node().clientWidth || 1000);
  const height = 520;

  const labels = data.map(d => `Tháng ${String(d.m).padStart(2, "0")}`);
  const x = d3.scaleBand().domain(labels).range([margin.left, width - margin.right]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.value)]).nice().range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal().domain(data.map(d => d.m)).range(d3.schemeSet3);

  const svg = chart.append("svg").attr("width", width).attr("height", height);
  const fmtVNDTrieu = v => d3.format(",.0f")(v / 1e6) + " triệu VND";

  svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d3.format(".0s")(d))).call(g => g.select(".domain").remove());
  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke","#000").attr("stroke-opacity",0.06);

  svg.append("g").selectAll("rect").data(data).join("rect")
    .attr("x", (d,i) => x(labels[i])).attr("y", d => y(d.value))
    .attr("width", x.bandwidth()).attr("height", d => y(0) - y(d.value))
    .attr("fill", d => color(d.m))
    .on("pointerenter", (event, d) => {
      const label = `Tháng ${String(d.m).padStart(2, "0")}`;
      const html =
        `<div><b>${label}</b></div>
         <div><b>Doanh số bán:</b> <span class="v">${fmtVNDTrieu(d.value)}</span></div>` +
        (d.qty != null ? `<div class="sub">Số lượng bán: ${fmtInt(d.qty)} SKUs</div>` : "");
      tip.html(html).style("opacity", 1);
    })
    .on("pointermove", (event) => {
      const pad = 12;
      tip.style("left", (event.clientX + pad) + "px").style("top", (event.clientY + pad) + "px");
    })
    .on("pointerleave", () => tip.style("opacity", 0));

  svg.append("g").selectAll("text.val")
    .data(data).join("text")
      .attr("x", (d,i) => x(labels[i]) + x.bandwidth()/2)
      .attr("y", d => y(d.value) - 6)
      .attr("text-anchor","middle").attr("font-size", 12).attr("fill", "#333")
      .text(d => d.value > 0 ? fmtVNDTrieu(d.value) : "");
}

/* ---------- Q4 – TB theo Ngày trong tuần ---------- */
async function renderQ4(rows) {
  const DATE_COL  = "Thời gian tạo đơn";
  const VALUE_COL = "Thành tiền";

  const pYMDHMS = d3.timeParse("%Y-%m-%d %H:%M:%S");
  const pYMD    = d3.timeParse("%Y-%m-%d");
  const pDMY    = d3.timeParse("%d/%m/%Y");
  const pMDY    = d3.timeParse("%m/%d/%Y");
  const fromExcelSerial = n => new Date(Math.round((+n - 25569) * 86400000) + 12*3600*1000);
  function parseDateCell(v) {
    if (v == null || v === "") return null;
    if (!isNaN(v) && v !== true && v !== false) { const num = +v; if (num > 10000) return fromExcelSerial(num); }
    const s = String(v).trim();
    return pYMDHMS(s) || pYMD(s) || pDMY(s) || pMDY(s) || null;
  }
  const dowMonToSun = d => ((d.getDay() + 6) % 7) + 1;

  const fmtDateKey = d3.timeFormat("%Y-%m-%d");
  const dailyTotal = new Map();
  rows.forEach(r => {
    const dt = parseDateCell(r[DATE_COL]);
    const val = toNumber(r[VALUE_COL]);
    const qty = toNumber(r["SL"]);
    if (!dt || !Number.isFinite(val)) return;
    const day = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const key = fmtDateKey(day);
    const dow = dowMonToSun(day);
    const curr = dailyTotal.get(key);
    if (curr) {
      curr.total += val;
      if (Number.isFinite(qty)) curr.qtyTotal += qty;
    } else {
      dailyTotal.set(key, { total: val, qtyTotal: Number.isFinite(qty) ? qty : 0, dow });
    }
  });

  const sums = Array.from({length: 8}, () => 0);
  const qtySums = Array.from({length: 8}, () => 0);
  const counts = Array.from({length: 8}, () => 0);
  dailyTotal.forEach(({ total, qtyTotal, dow }) => {
    sums[dow] += total; qtySums[dow] += qtyTotal || 0; counts[dow] += 1;
  });

  const dowNames = ["", "Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy","Chủ Nhật"];
  const data = d3.range(1, 8).map(dow => ({
    dow, label: dowNames[dow],
    avg: counts[dow] ? sums[dow] / counts[dow] : 0,
    avgQty: counts[dow] ? qtySums[dow] / counts[dow] : null
  }));

  const margin = { top: 40, right: 20, bottom: 50, left: 70 };
  const width  = Math.max(1000, chart.node().clientWidth || 1000);
  const height = 520;

  const x = d3.scaleBand().domain(data.map(d => d.label))
    .range([margin.left, width - margin.right]).padding(0.25);

  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.avg)]).nice()
    .range([height - margin.bottom, margin.top]);

  const color = d3.scaleOrdinal().domain(d3.range(1,8)).range(d3.schemeSet2.slice(0,7));
  const fmtVND = v => d3.format(",.0f")(v) + " VND";

  const svg = chart.append("svg").attr("width", width).attr("height", height);

  svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d3.format(".0s")(d))).call(g => g.select(".domain").remove());
  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke", "#000").attr("stroke-opacity", 0.06);

  svg.append("g").selectAll("rect").data(data).join("rect")
    .attr("x", d => x(d.label)).attr("y", d => y(d.avg))
    .attr("width", x.bandwidth()).attr("height", d => y(0) - y(d.avg))
    .attr("fill", d => color(d.dow))
    .on("pointerenter", (event, d) => {
      const html =
        `<div><b>Ngày ${d.label}</b></div>
         <div><b>Doanh số bán TB:</b> <span class="v">${fmtVND(d.avg)}</span></div>` +
        (d.avgQty != null ? `<div class="sub">Số lượng bán TB: ${fmtInt(d.avgQty)} SKUs</div>` : "");
      tip.html(html).style("opacity", 1);
    })
    .on("pointermove", (event) => {
      const pad = 12; tip.style("left", (event.clientX + pad) + "px").style("top", (event.clientY + pad) + "px");
    })
    .on("pointerleave", () => tip.style("opacity", 0));

  svg.append("g").selectAll("text.value").data(data).join("text")
    .attr("x", d => x(d.label) + x.bandwidth()/2).attr("y", d => y(d.avg) - 6)
    .attr("text-anchor", "middle").attr("font-size", 12).attr("fill", "#333")
    .text(d => d.avg > 0 ? fmtVND(d.avg) : "");
}

/* ---------- Q5 – TB theo Ngày trong tháng ---------- */
async function renderQ5(rows) {
  const DATE_COL  = "Thời gian tạo đơn";
  const VALUE_COL = "Thành tiền";

  const pYMDHMS = d3.timeParse("%Y-%m-%d %H:%M:%S");
  const pYMD    = d3.timeParse("%Y-%m-%d");
  const pDMY    = d3.timeParse("%d/%m/%Y");
  const pMDY    = d3.timeParse("%m/%d/%Y");
  const fromExcelSerial = n => new Date(Math.round((+n - 25569) * 86400000) + 12*3600*1000);
  function parseDateCell(v) {
    if (v == null || v === "") return null;
    if (!isNaN(v)) { const num = +v; if (num > 10000) return fromExcelSerial(num); }
    const s = String(v).trim();
    return pYMDHMS(s) || pYMD(s) || pDMY(s) || pMDY(s) || null;
  }

  const fmtTrieu = v => d3.format(",.1f")(v / 1e6) + " tr";
  const fmtTrieuVND = v => d3.format(",.1f")(v / 1e6) + " triệu VND";

  const fmtDate = d3.timeFormat("%Y-%m-%d");
  const daily = new Map();
  rows.forEach(r => {
    const dt = parseDateCell(r[DATE_COL]);
    const val = toNumber(r[VALUE_COL]);
    const qty = toNumber(r["SL"]);
    if (!dt || !Number.isFinite(val)) return;
    const key = fmtDate(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    const cur = daily.get(key);
    if (cur) { cur.total += val; if (Number.isFinite(qty)) cur.qtyTotal += qty; }
    else { daily.set(key, { total: val, qtyTotal: Number.isFinite(qty) ? qty : 0 }); }
  });

  const bucket = new Map();
  daily.forEach((v, key) => {
    const d = new Date(key).getDate();
    if (!bucket.has(d)) bucket.set(d, { sumVal: 0, sumQty: 0, count: 0 });
    const o = bucket.get(d); o.sumVal += v.total; o.sumQty += v.qtyTotal || 0; o.count += 1;
  });

  const data = d3.range(1, 32).map(day => {
    const o = bucket.get(day) || { sumVal: 0, sumQty: 0, count: 0 };
    return { day, avg: o.count ? o.sumVal / o.count : 0, avgQty: o.count ? o.sumQty / o.count : null };
  });

  const margin = { top: 40, right: 20, bottom: 50, left: 70 };
  const width  = Math.max(1000, chart.node().clientWidth || 1000);
  const height = 520;

  const x = d3.scaleBand().domain(data.map(d => d.day))
    .range([margin.left, width - margin.right]).padding(0.15);

  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.avg)]).nice()
    .range([height - margin.bottom, margin.top]);

  const color = d3.scaleOrdinal().domain(data.map(d => d.day))
    .range(d3.schemeTableau10.concat(d3.schemeSet3).slice(0,31));

  const svg = chart.append("svg").attr("width", width).attr("height", height);

  svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d => `Ngày ${String(d).padStart(2,"0")}`));

  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => fmtTrieu(d))).call(g => g.select(".domain").remove());

  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll("line").attr("stroke","#000").attr("stroke-opacity",0.06);

  svg.append("g").selectAll("rect").data(data).join("rect")
    .attr("x", d => x(d.day)).attr("y", d => y(d.avg))
    .attr("width", x.bandwidth()).attr("height", d => y(0) - y(d.avg))
    .attr("fill", d => color(d.day))
    .on("pointerenter", (event, d) => {
      const label = `Ngày ${String(d.day).padStart(2,"0")}`;
      const html =
        `<div><b>${label}</b></div>
         <div><b>Doanh số bán TB:</b> <span class="v">${fmtTrieuVND(d.avg)}</span></div>` +
        (d.avgQty != null ? `<div class="sub">Số lượng bán TB: ${fmtInt(d.avgQty)} SKUs</div>` : "");
      tip.html(html).style("opacity", 1);
    })
    .on("pointermove", (event) => {
      const pad = 12; tip.style("left", (event.clientX + pad) + "px").style("top", (event.clientY + pad) + "px");
    })
    .on("pointerleave", () => tip.style("opacity", 0));

  svg.append("g").selectAll("text.val").data(data).join("text")
    .attr("x", d => x(d.day) + x.bandwidth()/2).attr("y", d => y(d.avg) - 5)
    .attr("text-anchor","middle").attr("font-size",11).attr("fill","#333")
    .text(d => d.avg>0 ? fmtTrieu(d.avg) : "");
}

/* ---------- Q6 – TB theo Khung giờ ---------- */
async function renderQ6(rows) {
  const DATE_COL  = "Thời gian tạo đơn";
  const VALUE_COL = "Thành tiền";
  const toIntQty = v => {
    const s = String(v ?? "").trim();
    if (!s) return NaN;
    if (s.includes(".") && s.includes(",")) return +s.replace(/\./g,"").replace(",",".").replace(/[^\d.-]/g,"");
    const digits = s.replace(/[.,\s]/g,"").replace(/[^\d-]/g,"");
    return digits ? +digits : NaN;
  };
  const fmtVND = v => d3.format(",.0f")(v) + " VND";

  const pYMDHMS = d3.timeParse("%Y-%m-%d %H:%M:%S");
  const pYMD    = d3.timeParse("%Y-%m-%d");
  const pDMY    = d3.timeParse("%d/%m/%Y");
  const pMDY    = d3.timeParse("%m/%d/%Y");
  const fromExcelSerial = n => new Date(Math.round((+n - 25569) * 86400000) + 12*3600*1000);
  function parseDateCell(v){
    if (v == null || v === "") return null;
    if (!isNaN(v) && v !== true && v !== false) { const num = +v; if (num > 10000) return fromExcelSerial(num); }
    const s = String(v).trim();
    return pYMDHMS(s) || pYMD(s) || pDMY(s) || pMDY(s) || null;
  }
  const dayKey = d3.timeFormat("%Y-%m-%d");

  const recs = rows.map(r => {
    const dt = parseDateCell(r[DATE_COL]); if (!dt) return null;
    const v = toNumber(r[VALUE_COL]); const q = toIntQty(r["SL"]);
    if (!Number.isFinite(v) && !Number.isFinite(q)) return null;
    return { h: dt.getHours(), d: dayKey(dt), v: Number.isFinite(v)?v:0, q: Number.isFinite(q)?q:0 };
  }).filter(Boolean);

  const byHourDay = d3.rollup(
    recs,
    v => d3.rollup(v, vv => ({ sumV: d3.sum(vv, d => d.v), sumQ: d3.sum(vv, d => d.q) }), d => d.d),
    d => d.h
  );
  const totalQtyByHour = d3.rollup(recs, v => d3.sum(v, d => d.q), d => d.h);

  const stats = d3.range(0,24).map(h => {
    const dayMap = byHourDay.get(h);
    const perDay = dayMap ? Array.from(dayMap.values()) : [];
    const avg    = perDay.length ? d3.mean(perDay, o => o.sumV) : 0;
    const sumQty = totalQtyByHour.get(h) ?? null;
    return { h, label: `${String(h).padStart(2,"0")}:00-${String(h).padStart(2,"0")}:59`, avg, sumQty };
  }).filter(d => d.avg > 0 || (d.sumQty ?? 0) > 0);

  const margin = { top: 36, right: 24, bottom: 60, left: 70 };
  const width  = Math.max(1100, chart.node().clientWidth || 1100);
  const height = 520;

  const x = d3.scaleBand().domain(stats.map(d => d.label))
    .range([margin.left, width - margin.right]).padding(0.18);
  const y = d3.scaleLinear().domain([0, d3.max(stats, d => d.avg)]).nice()
    .range([height - margin.bottom, margin.top]);
  const color = d3.scaleSequential(d3.interpolateTurbo).domain([0,23]);

  const svg = chart.append("svg").attr("width",width).attr("height",height);
  svg.append("g").attr("transform",`translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
  svg.append("g").attr("transform",`translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickFormat(d => d3.format(".0s")(d))).call(g => g.select(".domain").remove());
  svg.append("g").attr("transform",`translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke","#000").attr("stroke-opacity",.06);

  svg.append("g").selectAll("rect").data(stats).join("rect")
    .attr("x", d => x(d.label)).attr("y", d => y(d.avg))
    .attr("width", x.bandwidth()).attr("height", d => y(0)-y(d.avg))
    .attr("fill", d => color(d.h))
    .on("pointerenter", (event, d) => {
      const html =
        `<div><b>Khung giờ:</b> <span class="v">${d.label}</span></div>
         <div><b>Doanh số bán TB:</b> <span class="v">${fmtVND(d.avg)}</span></div>` +
        (d.sumQty != null ? `<div class="sub">Số lượng bán: ${fmtInt(d.sumQty)} SKUs</div>` : "");
      tip.html(html).style("opacity",1);
    })
    .on("pointermove", (event) => {
      const pad = 12; tip.style("left",(event.clientX+pad)+"px").style("top",(event.clientY+pad)+"px");
    })
    .on("pointerleave", () => tip.style("opacity",0));

  svg.append("g").selectAll("text.val").data(stats).join("text")
    .attr("x", d => x(d.label)+x.bandwidth()/2).attr("y", d => y(d.avg)-6)
    .attr("text-anchor","middle").attr("font-size",12).attr("fill","#333")
    .text(d => fmtVND(d.avg));
}

/* ---------- Q7 – Xác suất theo Nhóm hàng ---------- */
async function renderQ7(rows) {
  const ORDER_COL   = "Mã đơn hàng";
  const GROUP_CODE  = "Mã nhóm hàng";
  const GROUP_NAME  = "Tên nhóm hàng";
  const totalOrders = new Set(rows.map(r => String(r[ORDER_COL]).trim())).size;

  const keyOf = r => {
    const code = String(r[GROUP_CODE] ?? "").trim();
    const name = String(r[GROUP_NAME] ?? "").trim();
    return `[${code}] ${name}`.trim();
  };

  const groupToOrderSet = new Map();
  for (const r of rows) {
    const key = keyOf(r);
    const ord = String(r[ORDER_COL]).trim();
    if (!key || !ord) continue;
    if (!groupToOrderSet.has(key)) groupToOrderSet.set(key, new Set());
    groupToOrderSet.get(key).add(ord);
  }

  let data = Array.from(groupToOrderSet, ([group, ids]) => ({
    group, count: ids.size, p: totalOrders ? ids.size / totalOrders : 0
  })).sort((a,b)=>d3.descending(a.p, b.p));

  const margin = { top: 10, right: 90, bottom: 40, left: 180 };
  const width  = Math.max(980, chart.node().clientWidth || 980);
  const height = margin.top + margin.bottom + data.length * 54;

  const svg = chart.append("svg").attr("width", width).attr("height", height);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.p) || 1]).nice().range([margin.left, width - margin.right]);
  const y = d3.scaleBand().domain(data.map(d => d.group)).range([margin.top, height - margin.bottom]).padding(0.25);
  const color = d3.scaleOrdinal().domain(data.map(d => d.group)).range(d3.schemeTableau10);

  svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format(".0%"))).call(g => g.select(".domain").remove());
  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0)).call(g => g.select(".domain").remove());
  svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke", "#000").attr("stroke-opacity", 0.06);

  svg.append("g").selectAll("rect").data(data).join("rect")
    .attr("x", x(0)).attr("y", d => y(d.group))
    .attr("width", d => x(d.p) - x(0)).attr("height", y.bandwidth()).attr("fill", d => color(d.group))
    .on("pointerenter", (event,d) => {
      const html =
        `<div><b>Nhóm hàng:</b> <span class="v">${d.group}</span></div>
         <div><b>SL Đơn Bán:</b> <span class="v">${fmtInt(d.count)}</span></div>
         <div><b>Xác suất Bán:</b> <span class="v">${d3.format(".1%")(d.p)}</span></div>`;
      tip.html(html).style("opacity",1);
    })
    .on("pointermove", (event) => {
      const pad = 12; tip.style("left",(event.clientX+pad)+"px").style("top",(event.clientY+pad)+"px");
    })
    .on("pointerleave", () => tip.style("opacity",0));

  svg.append("g").selectAll("text.label").data(data).join("text")
    .attr("x", d => x(d.p) + 8).attr("y", d => y(d.group) + y.bandwidth()/2 + 4)
    .attr("fill", "#333").attr("font-size", 12).text(d => d3.format(".1%")(d.p));
}

/* ---------- Q8 – Xác suất Nhóm hàng theo Tháng ---------- */
async function renderQ8(rows) {
  const DATE_COL   = "Thời gian tạo đơn";
  const ORDER_COL  = "Mã đơn hàng";
  const GROUP_CODE = "Mã nhóm hàng";
  const GROUP_NAME = "Tên nhóm hàng";

  const pYMDHMS = d3.timeParse("%Y-%m-%d %H:%M:%S");
  const pYMD    = d3.timeParse("%Y-%m-%d");
  const pDMY    = d3.timeParse("%d/%m/%Y");
  const pMDY    = d3.timeParse("%m/%d/%Y");
  const fromExcelSerial = n => new Date(Math.round((+n - 25569) * 86400000) + 12*3600*1000);
  function parseDateCell(v){
    if (v == null || v === "") return null;
    if (!isNaN(v) && v !== true && v !== false){
      const num = +v; if (num > 10000) return fromExcelSerial(num);
    }
    const s = String(v).trim();
    return pYMDHMS(s) || pYMD(s) || pDMY(s) || pMDY(s) || null;
  }
  const monthLabel = m => `Tháng ${String(m).padStart(2,"0")}`;

  const recs = rows.map(r=>{
    const dt = parseDateCell(r[DATE_COL]);
    const m  = dt ? +d3.timeFormat("%m")(dt) : null;
    const order = String(r[ORDER_COL] ?? "").trim();
    const code  = String(r[GROUP_CODE] ?? "").trim();
    const name  = String(r[GROUP_NAME] ?? "").trim();
    const group = `[${code}] ${name}`.trim();
    return { m, order, group };
  }).filter(d => d.m && d.order && d.group);

  const monthToOrderSet = new Map();
  for (const d of recs){
    if (!monthToOrderSet.has(d.m)) monthToOrderSet.set(d.m, new Set());
    monthToOrderSet.get(d.m).add(d.order);
  }
  const gmToOrderSet = new Map();
  const groups = new Set();
  const gmKey = (g,m) => `${g}|${m}`;
  for (const d of recs){
    groups.add(d.group);
    const k = gmKey(d.group, d.m);
    if (!gmToOrderSet.has(k)) gmToOrderSet.set(k, new Set());
    gmToOrderSet.get(k).add(d.order);
  }

  const months = d3.range(1,13);
  const series = Array.from(groups).sort().map(g=>{
    const values = months.map(m=>{
      const denom = (monthToOrderSet.get(m) || new Set()).size;
      const numer = (gmToOrderSet.get(gmKey(g,m)) || new Set()).size;
      const p = denom ? numer/denom : 0;
      return { m, p, numer, denom };
    });
    return { group: g, values };
  });

  const margin = { top: 40, right: 170, bottom: 46, left: 60 };
  const width  = Math.max(1100, chart.node().clientWidth || 1100);
  const height = 520;

  const svg = chart.append("svg").attr("width", width).attr("height", height);
  const x = d3.scalePoint().domain(months).range([margin.left, width - margin.right]).padding(0.5);
  const y = d3.scaleLinear().domain([0, d3.max(series.flatMap(s => s.values.map(v=>v.p))) || 1]).nice()
    .range([height - margin.bottom, margin.top]);
  const color = d3.scaleOrdinal().domain(series.map(s=>s.group)).range(d3.schemeTableau10);

  svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(monthLabel)).selectAll("text").attr("font-size", 12);
  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickFormat(d3.format(".0%"))).call(g => g.select(".domain").remove());
  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke", "#000").attr("stroke-opacity", 0.06);

  const line = d3.line().x(d => x(d.m)).y(d => y(d.p));
  const gLines = svg.append("g");
  series.forEach(s => {
    gLines.append("path").datum(s.values)
      .attr("fill","none").attr("stroke", color(s.group)).attr("stroke-width", 2.5).attr("d", line);

    const layer = gLines.append("g").attr("data-group", s.group);
    layer.selectAll("circle").data(s.values.map(v => ({...v, group: s.group}))).join("circle")
      .attr("cx", d => x(d.m)).attr("cy", d => y(d.p)).attr("r", 4).attr("fill", color(s.group))
      .on("pointerenter", (event, d) => {
        const html =
          `<div><b>${monthLabel(d.m)} | Nhóm hàng ${d.group}</b></div>
           <div class="sub">SL Đơn Bán: <span class="v">${fmtInt(d.numer)}</span></div>
           <div class="sub">Xác suất Bán: <span class="v">${d3.format(".1%")(d.p)}</span></div>`;
        tip.html(html).style("opacity", 1);
      })
      .on("pointermove", (event) => {
        const pad = 12; tip.style("left", (event.clientX + pad) + "px").style("top", (event.clientY + pad) + "px");
      })
      .on("pointerleave", () => tip.style("opacity", 0));

    layer.selectAll("text").data(s.values).join("text")
      .attr("x", d => x(d.m)).attr("y", d => y(d.p) - 6)
      .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", color(s.group))
      .text(d => d3.format(".0%")(d.p));
  });

  // Legend
  const legend = svg.append("g").attr("class","legend")
    .attr("transform", `translate(${width - margin.right + 10}, ${margin.top})`);
  const leg = legend.selectAll("g").data(series.map(s=>s.group)).join("g")
    .attr("transform", (d,i)=>`translate(0, ${i*20})`);
  leg.append("rect").attr("width", 12).attr("height", 12).attr("fill", d=>color(d));
  leg.append("text").attr("x", 16).attr("y", 10).text(d=>d);
}

/* ---------- Q9 – Xác suất Mặt hàng theo Nhóm hàng (subplots) ---------- */
async function renderQ9(rows) {
  const COL = {
    order: "Mã đơn hàng",
    gcode: "Mã nhóm hàng",
    gname: "Tên nhóm hàng",
    itemCode: "Mã mặt hàng",
    itemName: "Tên mặt hàng",
    groupBoth: "Mã và tên nhóm hàng"
  };
  const tidy = v => String(v ?? "").trim();

  const must = [COL.order, COL.itemCode, COL.itemName];
  if (!(must.every(c => c in rows[0]))) {
    chart.append("div").attr("class","note").text(`Thiếu cột: ${must.join(" · ")}`); return;
  }

  const data = rows.map(r => {
    const order = tidy(r[COL.order]);
    const gkey  = COL.groupBoth in r && tidy(r[COL.groupBoth])
      ? tidy(r[COL.groupBoth])
      : `[${tidy(r[COL.gcode]??"")}] ${tidy(r[COL.gname]??"")}`.trim();
    const ikey  = `[${tidy(r[COL.itemCode])}] ${tidy(r[COL.itemName])}`;
    return { order, group: gkey, item: ikey };
  }).filter(d => d.order && d.group && d.item);

  if (!data.length){
    chart.append("div").attr("class","note")
      .text("Không có bản ghi hợp lệ (thiếu mã đơn / nhóm / mặt hàng).");
    return;
  }

  const byGroup = d3.group(data, d => d.group);
  const groups  = Array.from(byGroup.keys()).sort(d3.ascending);
  const color = d3.scaleOrdinal().range(d3.schemeTableau10);

  const grid = chart.append("div").attr("class","gridwrap");

  const tipLocal = d3.select("body").append("div").attr("class","tooltip").style("display","none");

  groups.forEach(groupName => {
    const arr = byGroup.get(groupName);
    const denom = new Set(arr.map(d => d.order)).size;
    const orderByItem = d3.rollup(arr, v => new Set(v.map(d => d.order)).size, d => d.item);
    let items = Array.from(orderByItem, ([name, numer]) => ({
      name, numer, denom, proba: denom ? numer / denom : 0
    })).sort((a,b) => d3.descending(a.proba, b.proba));

    const card  = grid.append("div").attr("class","subplot");
    card.append("h3").text(groupName);

    if (!denom){
      card.append("div").attr("class","note").text("Không có đơn hàng trong nhóm này."); return;
    }

    const longestName = d3.max(items, d => d.name.length) || 10;
    const leftPad     = Math.min(260, Math.max(180, longestName * 6.2));

    const margin = { top: 6, right: 90, bottom: 34, left: leftPad };
    const outerW = 440;
    const W      = outerW - margin.left - margin.right;
    const H      = Math.max(150, items.length * 26);

    const svg = card.append("svg").attr("width", outerW).attr("height", H + margin.top + margin.bottom);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xMax = d3.max(items, d => d.proba) || 0.01;
    const x = d3.scaleLinear().domain([0, xMax * 1.06]).range([0, W]);
    const y = d3.scaleBand().domain(items.map(d => d.name)).range([0, H]).padding(0.12);

    g.append("g").attr("class","axis").call(d3.axisLeft(y));
    g.append("g").attr("class","axis").attr("transform", `translate(0,${H})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format(".0%")));

    g.selectAll("rect").data(items).join("rect")
      .attr("x", 0).attr("y", d => y(d.name)).attr("height", y.bandwidth()).attr("width", d => x(d.proba))
      .attr("fill", d => color(d.name))
      .on("pointerenter", function (ev,d) {
        d3.select(this).attr("stroke", "#2d3748").attr("stroke-width", 1);
        const html =
          `<div style="display:grid;grid-template-columns:150px 1fr;gap:6px;min-width:320px">
             <div><b>Mặt hàng:</b></div><div><b>${d.name}</b></div>
             <div><b>Nhóm hàng:</b></div><div>${groupName}</div>
             <div>SL Đơn Bán:</div><div>${fmtInt(d.numer)}</div>
             <div>Xác suất Bán / Nhóm hàng:</div><div>${d3.format(".0%")(d.proba)}</div>
           </div>`;
        tipLocal.html(html).style("display","block").style("opacity",1);
      })
      .on("pointermove", (ev) => {
        const pad = 12; tipLocal.style("left", (ev.clientX + pad) + "px").style("top", (ev.clientY + pad) + "px");
      })
      .on("pointerleave", function(){
        d3.select(this).attr("stroke", null).attr("stroke-width", null);
        tipLocal.style("display","none").style("opacity",0);
      });

    g.selectAll("text.value").data(items).join("text")
      .attr("class","value").attr("x", d => x(d.proba) + 6).attr("y", d => y(d.name) + y.bandwidth()/2)
      .attr("dy",".35em").text(d => d3.format(".1%")(d.proba));
  });
}

/* ---------- Q10 – Xác suất theo Nhóm & Tháng (subplots) ---------- */
async function renderQ10(rows) {
  const DATE_COL  = "Thời gian tạo đơn";
  const ORDER_COL = "Mã đơn hàng";
  const GCODE_COL = "Mã nhóm hàng";
  const GNAME_COL = "Tên nhóm hàng";
  const ITCODE_COL= "Mã mặt hàng";
  const ITNAME_COL= "Tên mặt hàng";

  const tidy = v => String(v ?? "").trim();
  const parseHMS = d3.timeParse("%Y-%m-%d %H:%M:%S");
  const parseYMD = d3.timeParse("%Y-%m-%d");
  const pDMY     = d3.timeParse("%d/%m/%Y");
  const pMDY     = d3.timeParse("%m/%d/%Y");
  const fromExcelSerial = n => new Date(Math.round((+n - 25569) * 86400000) + 12*3600*1000);
  function parseDateAny(v){
    if (v == null || v === "") return null;
    if (!isNaN(v)) { const n = +v; if (n > 10000) return fromExcelSerial(n); }
    const s = String(v).trim();
    return parseHMS(s) || parseYMD(s) || pDMY(s) || pMDY(s) || null;
  }

  const data = rows.map(r=>{
    const order = tidy(r[ORDER_COL]);
    const gcode = tidy(r[GCODE_COL]);
    const gname = tidy(r[GNAME_COL]);
    const icode = tidy(r[ITCODE_COL]);
    const iname = tidy(r[ITNAME_COL]);
    const dt    = parseDateAny(r[DATE_COL]);
    const m = dt ? "T"+String(dt.getMonth()+1).padStart(2,"0") : null;
    return { order, group:`[${gcode}] ${gname}`, item:`[${icode}] ${iname}`, month:m };
  }).filter(d=>d.order && d.group && d.item && d.month);

  const groups = d3.group(data, d=>d.group);
  const color = d3.scaleOrdinal(d3.schemeTableau10);
  const grid = chart.append("div").attr("class","gridwrap");
  const tipLocal = d3.select("body").append("div").attr("class","tooltip").style("display","none");

  groups.forEach((arr,g)=>{
    const denomMap = d3.rollup(arr, v => new Set(v.map(d=>d.order)).size, d => d.month);
    const numMap = d3.rollup(arr, v => new Set(v.map(d => d.order)).size, d => d.month, d => d.item);

    let recs = [];
    numMap.forEach((itemMap, m) => {
      const denom = denomMap.get(m) || 0;
      itemMap.forEach((cnt, item) => {
        const prob = denom ? cnt / denom : 0;
        recs.push({ group: g, month: m, item, prob, cnt, denom });
      });
    });

    const months=[...new Set(recs.map(d=>d.month))].sort();
    const items =[...new Set(recs.map(d=>d.item))];

    const container = grid.append("div").attr("class","subplot");
    container.append("h3").text(g);
    const svg=container.append("svg").attr("class","chart-area").attr("width",400).attr("height",220);

    const margin={top:10,right:20,bottom:30,left:44};
    const innerW=+svg.attr("width")-margin.left-margin.right;
    const innerH=+svg.attr("height")-margin.top-margin.bottom;
    const gWrap=svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);

    const x=d3.scalePoint().domain(months).range([0,innerW]).padding(0.5);
    const y=d3.scaleLinear().domain([0, d3.max(recs,d=>d.prob)||1]).nice().range([innerH,0]);

    gWrap.append("g").attr("transform",`translate(0,${innerH})`).call(d3.axisBottom(x));
    gWrap.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));

    const line=d3.line().x(d=>x(d.month)).y(d=>y(d.prob));
    d3.group(recs,d=>d.item).forEach(vals=>{
      gWrap.append("path").datum(vals.sort((a,b)=>d3.ascending(a.month,b.month)))
        .attr("fill","none").attr("stroke",color(vals[0].item)).attr("stroke-width",2).attr("d",line);
    });

    gWrap.selectAll("circle").data(recs).join("circle")
      .attr("cx",d=>x(d.month)).attr("cy",d=>y(d.prob)).attr("r",3.2).attr("fill",d=>color(d.item))
      .on("pointerenter",(ev,d)=>{
        const html =
          `<div><b>${d.month} | Mặt hàng ${d.item}</b></div>
           <div class="sub">Nhóm hàng: ${d.group} &nbsp; | &nbsp; SL Đơn Bán: ${fmtInt(d.cnt)}</div>
           <div class="sub">Xác suất Bán / Nhóm hàng: ${d3.format(".1%")(d.prob)}</div>`;
        tipLocal.html(html).style("display","block");
      })
      .on("pointermove",(ev)=>{
        const pad=12; tipLocal.style("left",(ev.clientX+pad)+"px").style("top",(ev.clientY+pad)+"px");
      })
      .on("pointerleave",()=>tipLocal.style("display","none"));

    const legend=container.append("div").attr("class","legend");
    items.forEach(it=>{
      const li=legend.append("div").attr("class","legend-item");
      li.append("div").attr("class","legend-color").style("background",color(it));
      li.append("span").text(it);
    });
  });
}

/* ---------- Q11 – Phân phối Lượt mua hàng ---------- */
async function renderQ11(rows) {
  const CUSTOMER_COL = "Mã khách hàng";
  const ORDER_COL    = "Mã đơn hàng";

  if (!(CUSTOMER_COL in rows[0]) || !(ORDER_COL in rows[0])) {
    chart.append("div").style("color","crimson").text(`Thiếu cột "${CUSTOMER_COL}" hoặc "${ORDER_COL}".`); return;
  }

  const map = new Map();
  for (const r of rows){
    const kh = String(r[CUSTOMER_COL] ?? "").trim();
    const od = String(r[ORDER_COL] ?? "").trim();
    if (!kh || !od) continue;
    if (!map.has(kh)) map.set(kh, new Set());
    map.get(kh).add(od);
  }
  const perCustomer = Array.from(map, ([kh, set]) => ({kh, SoLuotMua: set.size}));

  const freq = d3.rollup(perCustomer, v => v.length, d => d.SoLuotMua);
  const data = Array.from(freq, ([SoLuotMua, SoKhach]) => ({SoLuotMua, SoKhach}))
    .sort((a,b)=>d3.ascending(a.SoLuotMua,b.SoLuotMua));

  const margin = {top:50,right:20,bottom:50,left:70};
  const width  = Math.max(1100, chart.node().clientWidth || 1100);
  const height = 520;

  const svg = chart.append("svg").attr("width",width).attr("height",height);
  const x = d3.scaleBand().domain(data.map(d=>String(d.SoLuotMua))).range([margin.left,width-margin.right]).padding(0.2);
  const y = d3.scaleLinear().domain([0,d3.max(data,d=>d.SoKhach)||0]).nice().range([height-margin.bottom,margin.top]);

  svg.append("g").attr("transform",`translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickSize(-(width-margin.left-margin.right)).tickFormat(""))
    .call(g => g.selectAll(".tick line").attr("stroke","#000").attr("stroke-opacity",0.05))
    .call(g => g.select(".domain").remove());

  const fmt = d3.format(",");
  svg.append("g").selectAll("rect").data(data).join("rect")
    .attr("x",d=>x(String(d.SoLuotMua))).attr("y",d=>y(d.SoKhach))
    .attr("width",x.bandwidth()).attr("height",d=>(height-margin.bottom)-y(d.SoKhach))
    .attr("fill","steelblue")
    .on("pointerenter",(ev,d)=>{
      tip.style("display","block").html(
        `<div><b>Đã mua ${d.SoLuotMua} lần</b></div><div>Số lượng KH: ${fmt(d.SoKhach)}</div>`
      );
    })
    .on("pointermove",(ev)=>tip.style("left",(ev.clientX+12)+"px").style("top",(ev.clientY-28)+"px"))
    .on("pointerleave",()=>tip.style("display","none"));

  svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x)).selectAll("text").attr("font-size",12);
  svg.append("g").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(8).tickFormat(d3.format(","))).selectAll("text").attr("font-size",12);
  svg.append("text").attr("x",margin.left-50).attr("y",margin.top-20).attr("font-size",13).attr("font-weight","600").text("Số khách hàng");
}

/* ---------- Q12 – Phân phối Mức chi trả ---------- */
async function renderQ12(rows) {
  const CUSTOMER_COL  = "Mã khách hàng";
  const SALES_COL     = "Thành tiền";
  const BIN_STEP = 50_000;

  if (!(CUSTOMER_COL in rows[0]) || !(SALES_COL in rows[0])) {
    chart.append("div").style("color","crimson").text(`Thiếu cột "${CUSTOMER_COL}" hoặc "${SALES_COL}".`); return;
  }

  function parseMoney(v){
    if (v == null || v === "") return 0;
    const s = String(v).replace(/[^0-9.-]/g, ""); const n = +s;
    return isNaN(n) ? 0 : n;
  }

  const spendByCustomer = new Map();
  for (const r of rows){
    const kh = String(r[CUSTOMER_COL] ?? "").trim(); if (!kh) continue;
    const sales = parseMoney(r[SALES_COL]);
    spendByCustomer.set(kh, (spendByCustomer.get(kh) || 0) + sales);
  }
  const totals = Array.from(spendByCustomer.values());
  if (!totals.length){ chart.append("div").text("Không có tổng chi tiêu hợp lệ."); return; }

  const maxTotal = d3.max(totals) || 0;
  const maxEdge  = Math.ceil(maxTotal / BIN_STEP) * BIN_STEP;
  const bins = d3.bin().domain([0, maxEdge]).thresholds(d3.range(0, maxEdge + BIN_STEP, BIN_STEP))(totals);

  const data = bins.map(b => ({ x0: b.x0, x1: b.x1, label: d3.format(",")(Math.round(b.x0)), SoKhach: b.length }));

  const margin = { top: 54, right: 20, bottom: 80, left: 74 };
  const width  = Math.max(1400, chart.node().clientWidth || 1200);
  const height = 560;

  const svg = chart.append("svg").attr("width", width).attr("height", height);
  const x = d3.scaleBand().domain(data.map(d => d.label)).range([margin.left, width - margin.right]).padding(0.12);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.SoKhach) || 0]).nice().range([height - margin.bottom, margin.top]);

  svg.append("g").attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call(g => g.selectAll(".tick line").attr("stroke", "#000").attr("stroke-opacity", 0.05))
    .call(g => g.select(".domain").remove());

  svg.append("g").selectAll("rect").data(data).join("rect")
    .attr("x", d => x(d.label)).attr("y", d => y(d.SoKhach))
    .attr("width", x.bandwidth()).attr("height", d => (height - margin.bottom) - y(d.SoKhach))
    .attr("fill", "steelblue")
    .on("pointerenter", (ev, d) => {
      const html =
        `<div><b>Đã chi tiêu Từ ${d3.format(",")(d.x0)} đến ${d3.format(",")(d.x1)}</b></div>
         <div class="sub">Số lượng KH: ${d3.format(",")(d.SoKhach)}</div>`;
      tip.html(html).style("display", "block");
    })
    .on("pointermove", (ev) => {
      const pad = 12; tip.style("left", (ev.clientX + pad) + "px").style("top", (ev.clientY + pad) + "px");
    })
    .on("pointerleave", () => tip.style("display", "none"));

  const gx = svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x));
  gx.selectAll("text").attr("font-size", 11).attr("text-anchor", "end").attr("transform", "rotate(-90)").attr("dx", "-0.4em").attr("dy", "0.25em");
  svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(8).tickFormat(d3.format(","))).selectAll("text").attr("font-size", 12);
  svg.append("text").attr("x", margin.left - 56).attr("y", margin.top - 18).attr("font-size", 13).attr("font-weight", "600").text("Số khách hàng");
}
