// Q4 – Doanh số bán hàng trung bình theo ngày trong tuần (Thứ 2..Chủ Nhật)
const CSV_PATH = "../data/data_ggsheet_data.csv";

// KHÓA TÊN CỘT THEO DATASET
const DATE_COL  = "Thời gian tạo đơn";
const VALUE_COL = "Thành tiền";

/* ---------- helpers ---------- */
const toNumber = v => +String(v ?? "").replace(/[^\d.-]/g, "");
const fmtVND = v => d3.format(",.0f")(v) + " VND";
const fmtVNDTrieu = v => d3.format(",.1f")(v / 1e6) + "M";
const fmtInt = v => d3.format(",.0f")(v);

// Tooltip div
const tip = d3.select("#tt");

// Parse ngày: "2022-01-01 08:01:09", "2022-01-01", "dd/mm/yyyy", "mm/dd/yyyy", serial Excel
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

// Chuẩn hóa thứ trong tuần về 1..7 (Thứ Hai..Chủ Nhật)
function dowMonToSun(d) {
  // JS: 0=CN..6=Th7, đổi về 1..7 (T2..CN)
  return ((d.getDay() + 6) % 7) + 1;
}

(async function run() {
  // Đọc CSV, tự nhận dấu , hoặc ;
  const raw = await d3.text(CSV_PATH);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  const dsv = d3.dsvFormat(sep);
  const rows = dsv.parse(raw);
  if (!rows.length) { d3.select("#chart").text("Không có dữ liệu."); return; }

  if (!(DATE_COL in rows[0]) || !(VALUE_COL in rows[0])) {
    d3.select("#chart").append("p").style("color","crimson")
      .text(`Không tìm thấy cột: "${DATE_COL}" hoặc "${VALUE_COL}".`);
    return;
  }

  // 1) Lấy tổng doanh số theo NGÀY (date-only)
  // key: yyyy-mm-dd; value: { total, qtyTotal, dow }
  const fmtDateKey = d3.timeFormat("%Y-%m-%d");
  const dailyTotal = new Map();

  rows.forEach(r => {
    const dt = parseDateCell(r[DATE_COL]);
    const val = toNumber(r[VALUE_COL]);
    const qty = toNumber(r["SL"]); // cột SL cho số lượng
    if (!dt || !Number.isFinite(val)) return;

    const day = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); // date only
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

  // 2) Trung bình theo từng thứ trong tuần:
  // AVERAGE( SUM(ngày) ) group theo dow
  const sums = Array.from({length: 8}, () => 0);     // [0..7]
  const qtySums = Array.from({length: 8}, () => 0);  // [0..7]
  const counts = Array.from({length: 8}, () => 0);   // [0..7]
  dailyTotal.forEach(({ total, qtyTotal, dow }) => {
    sums[dow] += total;
    qtySums[dow] += qtyTotal || 0;
    counts[dow] += 1;
  });

  const dowNames = [
    "", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"
  ];

  const data = d3.range(1, 8).map(dow => ({
    dow,
    label: dowNames[dow],
    avg: counts[dow] ? sums[dow] / counts[dow] : 0,
    avgQty: counts[dow] ? qtySums[dow] / counts[dow] : null
  }));

  // 3) Vẽ bar chart
  const margin = { top: 40, right: 20, bottom: 50, left: 70 };
  const width  = Math.max(1000, document.querySelector("#chart").clientWidth || 1000);
  const height = 520;

  const x = d3.scaleBand()
    .domain(data.map(d => d.label))
    .range([margin.left, width - margin.right])
    .padding(0.25);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.avg)]).nice()
    .range([height - margin.bottom, margin.top]);

  const color = d3.scaleOrdinal()
    .domain(d3.range(1,8))
    .range(d3.schemeSet2.slice(0,7)); // 7 màu

  const svg = d3.select("#chart").html("").append("svg")
    .attr("width", width)
    .attr("height", height);

  // Trục X
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));

  // Trục Y
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => fmtVNDTrieu(d)))
    .call(g => g.select(".domain").remove());

  // Grid ngang
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6)
      .tickSize(-(width - margin.left - margin.right))
      .tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line")
    .attr("stroke", "#000").attr("stroke-opacity", 0.06);

  // Cột + tooltip
  svg.append("g").selectAll("rect")
    .data(data).join("rect")
    .attr("x", d => x(d.label))
    .attr("y", d => y(d.avg))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d.avg))
    .attr("fill", d => color(d.dow))
    .on("pointerenter", (event, d) => {
      const html =
        `<div><b>Ngày ${d.label}</b></div>
         <div><b>Doanh số bán TB:</b> <span class="v">${fmtVND(d.avg)}</span></div>` +
        (d.avgQty != null ? `<div class="sub">Số lượng bán TB: ${fmtInt(d.avgQty)} SKUs</div>` : "");
      tip.html(html).style("opacity", 1);
    })
    .on("pointermove", (event) => {
      const pad = 12;
      tip.style("left", (event.clientX + pad) + "px")
         .style("top",  (event.clientY + pad) + "px");
    })
    .on("pointerleave", () => tip.style("opacity", 0));

  // Nhãn giá trị trên cột
  svg.append("g").selectAll("text.value")
    .data(data).join("text")
    .attr("x", d => x(d.label) + x.bandwidth()/2)
    .attr("y", d => y(d.avg) - 6)
    .attr("text-anchor", "middle")
    .attr("font-size", 12)
    .attr("fill", "#333")
    .text(d => d.avg > 0 ? fmtVND(d.avg) : "");
})();
