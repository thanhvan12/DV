// Q5 – Doanh số bán hàng trung bình theo ngày trong tháng (1..31)
const CSV_PATH = "../data/data_ggsheet_data.csv";

const DATE_COL  = "Thời gian tạo đơn";
const VALUE_COL = "Thành tiền";

const toNumber = v => +String(v ?? "").replace(/[^\d.-]/g, "");
const fmtTrieu = v => d3.format(",.1f")(v / 1e6) + " tr";
const fmtTrieuVND = v => d3.format(",.1f")(v / 1e6) + " triệu VND";
const fmtInt = v => d3.format(",.0f")(v);

// Tooltip div
const tip = d3.select("#tt");

// Parse date
const pYMDHMS = d3.timeParse("%Y-%m-%d %H:%M:%S");
const pYMD    = d3.timeParse("%Y-%m-%d");
const pDMY    = d3.timeParse("%d/%m/%Y");
const pMDY    = d3.timeParse("%m/%d/%Y");
const fromExcelSerial = n => new Date(Math.round((+n - 25569) * 86400000) + 12*3600*1000);

function parseDateCell(v) {
  if (v == null || v === "") return null;
  if (!isNaN(v)) {
    const num = +v;
    if (num > 10000) return fromExcelSerial(num);
  }
  const s = String(v).trim();
  return pYMDHMS(s) || pYMD(s) || pDMY(s) || pMDY(s) || null;
}

(async function run() {
  const raw = await d3.text(CSV_PATH);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  const dsv = d3.dsvFormat(sep);
  const rows = dsv.parse(raw);
  if (!rows.length) return;

  // 1) Tổng theo NGÀY thực tế (mỗi ngày: tổng tiền & tổng SL)
  const fmtDate = d3.timeFormat("%Y-%m-%d");
  const daily = new Map(); // key yyyy-mm-dd -> { total, qtyTotal }

  rows.forEach(r => {
    const dt = parseDateCell(r[DATE_COL]);
    const val = toNumber(r[VALUE_COL]);
    const qty = toNumber(r["SL"]); // cột SL
    if (!dt || !Number.isFinite(val)) return;

    const key = fmtDate(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    const cur = daily.get(key);
    if (cur) {
      cur.total += val;
      if (Number.isFinite(qty)) cur.qtyTotal += qty;
    } else {
      daily.set(key, { total: val, qtyTotal: Number.isFinite(qty) ? qty : 0 });
    }
  });

  // 2) Gom theo ngày trong tháng (1..31) và tính TRUNG BÌNH
  const bucket = new Map(); // day -> { sumVal, sumQty, count }
  daily.forEach((v, key) => {
    const d = new Date(key).getDate(); // 1..31
    if (!bucket.has(d)) bucket.set(d, { sumVal: 0, sumQty: 0, count: 0 });
    const o = bucket.get(d);
    o.sumVal += v.total;
    o.sumQty += v.qtyTotal || 0;
    o.count  += 1;
  });

  const data = d3.range(1, 32).map(day => {
    const o = bucket.get(day) || { sumVal: 0, sumQty: 0, count: 0 };
    return {
      day,
      avg:  o.count ? o.sumVal / o.count : 0,
      avgQty: o.count ? o.sumQty / o.count : null
    };
  });

  // 3) Vẽ bar chart
  const margin = { top: 40, right: 20, bottom: 50, left: 70 };
  const width  = Math.max(1000, document.querySelector("#chart").clientWidth || 1000);
  const height = 520;

  const x = d3.scaleBand()
    .domain(data.map(d => d.day))
    .range([margin.left, width - margin.right])
    .padding(0.15);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.avg)]).nice()
    .range([height - margin.bottom, margin.top]);

  const color = d3.scaleOrdinal()
    .domain(data.map(d => d.day))
    .range(d3.schemeTableau10.concat(d3.schemeSet3).slice(0, 31));

  const svg = d3.select("#chart").html("").append("svg")
    .attr("width", width).attr("height", height);

  // Trục X
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d => `Ngày ${String(d).padStart(2,"0")}`));

  // Trục Y
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => fmtTrieu(d)))
    .call(g => g.select(".domain").remove());

  // Grid ngang
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll("line").attr("stroke","#000").attr("stroke-opacity",0.06);

  // Cột + tooltip
  svg.append("g").selectAll("rect")
    .data(data).join("rect")
    .attr("x", d => x(d.day))
    .attr("y", d => y(d.avg))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d.avg))
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
      const pad = 12;
      tip.style("left", (event.clientX + pad) + "px")
         .style("top",  (event.clientY + pad) + "px");
    })
    .on("pointerleave", () => tip.style("opacity", 0));

  // Nhãn trên cột
  svg.append("g").selectAll("text.val")
    .data(data).join("text")
    .attr("x", d => x(d.day) + x.bandwidth()/2)
    .attr("y", d => y(d.avg) - 5)
    .attr("text-anchor","middle")
    .attr("font-size",11)
    .attr("fill","#333")
    .text(d => d.avg>0 ? fmtTrieu(d.avg) : "");
})();
