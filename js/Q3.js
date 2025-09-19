// Q3 – Doanh số bán theo Tháng (01..12) – gộp 1 cột/tháng
const CSV_PATH = "../data/data_ggsheet_data.csv";

// KHÓA TÊN CỘT THEO DATASET CỦA BẠN
const DATE_COL  = "Thời gian tạo đơn";
const VALUE_COL = "Thành tiền";

const toNumber = v => +String(v ?? "").replace(/[^\d.-]/g, "");
const fmtVNDTrieu = v => d3.format(",.0f")(v / 1e6) + " triệu VND";
const fmtInt = v => d3.format(",.0f")(v);

// Tooltip div
const tip = d3.select("#tt");

// Parse ngày
const pYMDHMS = d3.timeParse("%Y-%m-%d %H:%M:%S");
const pYMD    = d3.timeParse("%Y-%m-%d");
const pDMY    = d3.timeParse("%d/%m/%Y");
const pMDY    = d3.timeParse("%m/%d/%Y");
const fromExcelSerial = n => new Date(Math.round((+n - 25569) * 86400000) + 12*3600*1000);

function parseDateCell(v) {
  if (v == null || v === "") return null;
  if (!isNaN(v) && v !== true && v !== false) {
    const num = +v;
    if (num > 10000) return fromExcelSerial(num);
  }
  const s = String(v).trim();
  return pYMDHMS(s) || pYMD(s) || pDMY(s) || pMDY(s) || null;
}

(async function run() {
  // 1) Đọc CSV
  const raw = await d3.text(CSV_PATH);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  const dsv = d3.dsvFormat(sep);
  const rows = dsv.parse(raw);
  if (!rows.length) { d3.select("#chart").text("Không có dữ liệu."); return; }
  if (!(DATE_COL in rows[0]) || !(VALUE_COL in rows[0])) {
    d3.select("#chart").append("p").style("color","crimson")
      .text(`Không tìm thấy cột bắt buộc: "${DATE_COL}" hoặc "${VALUE_COL}".`);
    return;
  }

  // 2) Chuẩn hóa -> { m: 1..12, value, qty }
  const mapped = rows.map(r => {
    const dt  = parseDateCell(r[DATE_COL]);
    const m   = dt ? +d3.timeFormat("%m")(dt) : null; // 1..12
    const val = toNumber(r[VALUE_COL]);
    const qty = toNumber(r["SL"]);                    // ⬅ lấy SL
    return { m, value: val, qty: Number.isFinite(qty) ? qty : null };
  }).filter(d => d.m && Number.isFinite(d.value) && d.value > 0);

  // 3) Gộp theo tháng (sum value & sum qty)
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

  // 4) Vẽ cột dọc
  const margin = { top: 60, right: 30, bottom: 50, left: 70 };
  const width  = Math.max(1000, document.querySelector("#chart").clientWidth || 1000);
  const height = 520;

  const labels = data.map(d => `Tháng ${String(d.m).padStart(2, "0")}`);

  const x = d3.scaleBand()
    .domain(labels)
    .range([margin.left, width - margin.right])
    .padding(0.2);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.value)]).nice()
    .range([height - margin.bottom, margin.top]);

  const color = d3.scaleOrdinal()
    .domain(data.map(d => d.m))
    .range(d3.schemeSet3); // 12 màu

  const svg = d3.select("#chart").html("").append("svg")
    .attr("width", width).attr("height", height);

  // Legend
  const legend = svg.append("g").attr("class","legend")
    .attr("transform", `translate(${margin.left},${margin.top - 36})`);
  const itemW = 90, itemH = 14, gap = 8;
  const legendCols = Math.floor((width - margin.left - margin.right) / itemW) || 1;
  labels.forEach((lb, i) => {
    const col = i % legendCols;
    const row = Math.floor(i / legendCols);
    const g = legend.append("g")
      .attr("transform", `translate(${col * itemW}, ${row * (itemH + gap)})`);
    g.append("rect").attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", color(i + 1));
    g.append("text").attr("x", 16).attr("y", 10).attr("font-size", 12).attr("fill", "#333").text(lb);
  });

  // Trục X
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));

  // Trục Y + grid
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d3.format(".0s")(d)))
    .call(g => g.select(".domain").remove());

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke","#000").attr("stroke-opacity",0.06);

  // Cột + tooltip
  svg.append("g").selectAll("rect")
    .data(data).join("rect")
    .attr("x", (d,i) => x(labels[i]))
    .attr("y", d => y(d.value))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d.value))
    .attr("fill", d => color(d.m))
    .on("pointerenter", (event, d, i) => {
      const label = `Tháng ${String(d.m).padStart(2, "0")}`;
      const html =
        `<div><b>${label}</b></div>
         <div><b>Doanh số bán:</b> <span class="v">${fmtVNDTrieu(d.value)}</span></div>` +
        (d.qty != null ? `<div class="sub">Số lượng bán: ${fmtInt(d.qty)} SKUs</div>` : "");
      tip.html(html).style("opacity", 1);
    })
    .on("pointermove", (event) => {
      const pad = 12;
      tip.style("left", (event.clientX + pad) + "px")
         .style("top",  (event.clientY + pad) + "px");
    })
    .on("pointerleave", () => tip.style("opacity", 0));

  // Nhãn giá trị
  svg.append("g").selectAll("text.val")
    .data(data).join("text")
    .attr("x", (d,i) => x(labels[i]) + x.bandwidth()/2)
    .attr("y", d => y(d.value) - 6)
    .attr("text-anchor","middle")
    .attr("font-size", 12)
    .attr("fill", "#333")
    .text(d => d.value > 0 ? fmtVNDTrieu(d.value) : "");
})();
