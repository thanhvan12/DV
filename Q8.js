// Q8 – Xác suất bán hàng của Nhóm hàng theo Tháng
const CSV_PATH   = "../data/data_ggsheet_data.csv";
const DATE_COL   = "Thời gian tạo đơn";
const ORDER_COL  = "Mã đơn hàng";
const GROUP_CODE = "Mã nhóm hàng";
const GROUP_NAME = "Tên nhóm hàng";

/* ---------- helpers ---------- */
async function loadCSV(path){
  const raw = await d3.text(path);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  return d3.dsvFormat(sep).parse(raw);
}
const pYMDHMS = d3.timeParse("%Y-%m-%d %H:%M:%S");
const pYMD    = d3.timeParse("%Y-%m-%d");
const pDMY    = d3.timeParse("%d/%m/%Y");
const pMDY    = d3.timeParse("%m/%d/%Y");
const fromExcelSerial = n => new Date(Math.round((+n - 25569) * 86400000) + 12*3600*1000);

function parseDateCell(v){
  if (v == null || v === "") return null;
  if (!isNaN(v) && v !== true && v !== false){
    const num = +v;
    if (num > 10000) return fromExcelSerial(num);
  }
  const s = String(v).trim();
  return pYMDHMS(s) || pYMD(s) || pDMY(s) || pMDY(s) || null;
}
const monthLabel = m => `Tháng ${String(m).padStart(2,"0")}`;
const tip = d3.select("#tt");
const fmtInt = v => d3.format(",.0f")(v);

/* ---------- main ---------- */
(async function run(){
  const rows = await loadCSV(CSV_PATH);
  if (!rows.length){
    d3.select("#chart").text("Không có dữ liệu."); return;
  }
  if (!(DATE_COL in rows[0]) || !(ORDER_COL in rows[0]) || !(GROUP_CODE in rows[0])){
    d3.select("#chart").append("p")
      .style("color","crimson")
      .text(`Thiếu một trong các cột: "${DATE_COL}", "${ORDER_COL}", "${GROUP_CODE}".`);
    return;
  }

  // 1) Chuẩn hóa bản ghi -> {m, order, groupKey}
  const recs = rows.map(r=>{
    const dt = parseDateCell(r[DATE_COL]);
    const m  = dt ? +d3.timeFormat("%m")(dt) : null; // 1..12
    const order = String(r[ORDER_COL] ?? "").trim();
    const code  = String(r[GROUP_CODE] ?? "").trim();
    const name  = String(r[GROUP_NAME] ?? "").trim();
    const group = `[${code}] ${name}`.trim();
    return { m, order, group };
  }).filter(d => d.m && d.order && d.group);

  // 2) Mẫu số: tổng số đơn distinct theo tháng
  const monthToOrderSet = new Map(); // m -> Set(order)
  for (const d of recs){
    if (!monthToOrderSet.has(d.m)) monthToOrderSet.set(d.m, new Set());
    monthToOrderSet.get(d.m).add(d.order);
  }

  // 3) Tử số: số đơn distinct của (group, month)
  const gmToOrderSet = new Map(); // key "group|m" -> Set(order)
  const groups = new Set();
  const gmKey = (g,m) => `${g}|${m}`;
  for (const d of recs){
    groups.add(d.group);
    const k = gmKey(d.group, d.m);
    if (!gmToOrderSet.has(k)) gmToOrderSet.set(k, new Set());
    gmToOrderSet.get(k).add(d.order);
  }

  // 4) Chuẩn dữ liệu series cho các nhóm (1 series = 1 group)
  const months = d3.range(1,13);
  const series = Array.from(groups).sort().map(g=>{
    const values = months.map(m=>{
      const denom = (monthToOrderSet.get(m) || new Set()).size; // tổng đơn tháng
      const numer = (gmToOrderSet.get(gmKey(g,m)) || new Set()).size; // đơn nhóm-tháng
      const p = denom ? numer/denom : 0;
      return { m, p, numer, denom };
    });
    return { group: g, values };
  });

  // 5) Vẽ line chart
  const margin = { top: 40, right: 170, bottom: 46, left: 60 };
  const width  = Math.max(1100, (document.querySelector("#chart").clientWidth || 1100));
  const height = 520;

  const svg = d3.select("#chart").html("").append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3.scalePoint()
    .domain(months)
    .range([margin.left, width - margin.right])
    .padding(0.5);

  const y = d3.scaleLinear()
    .domain([0, d3.max(series.flatMap(s => s.values.map(v=>v.p))) || 1]).nice()
    .range([height - margin.bottom, margin.top]);

  const color = d3.scaleOrdinal()
    .domain(series.map(s=>s.group))
    .range(d3.schemeTableau10);

  // trục X
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(monthLabel))
    .selectAll("text").attr("font-size", 12);

  // trục Y + % + lưới
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickFormat(d3.format(".0%")))
    .call(g => g.select(".domain").remove());

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line")
      .attr("stroke", "#000")
      .attr("stroke-opacity", 0.06);

  // line generator
  const line = d3.line()
    .x(d => x(d.m))
    .y(d => y(d.p));

  // vẽ line + điểm cho từng nhóm
  const gLines = svg.append("g");
  series.forEach(s => {
    gLines.append("path")
      .datum(s.values)
      .attr("fill", "none")
      .attr("stroke", color(s.group))
      .attr("stroke-width", 2.5)
      .attr("d", line);

    const layer = gLines.append("g").attr("data-group", s.group);

    // điểm (tăng hit-area để hover dễ hơn)
    layer.selectAll("circle")
      .data(s.values.map(v => ({...v, group: s.group})))
      .join("circle")
        .attr("cx", d => x(d.m))
        .attr("cy", d => y(d.p))
        .attr("r", 4)                 // hơi lớn hơn 1 chút cho dễ rê
        .attr("fill", color(s.group))
        .on("pointerenter", (event, d) => {
          const html =
            `<div><b>${monthLabel(d.m)} | Nhóm hàng ${d.group}</b></div>
             <div class="sub">SL Đơn Bán: <span class="v">${fmtInt(d.numer)}</span></div>
             <div class="sub">Xác suất Bán: <span class="v">${d3.format(".1%")(d.p)}</span></div>`;
          tip.html(html).style("opacity", 1);
        })
        .on("pointermove", (event) => {
          const pad = 12;
          tip.style("left", (event.clientX + pad) + "px")
             .style("top",  (event.clientY + pad) + "px");
        })
        .on("pointerleave", () => tip.style("opacity", 0));

    // nhãn % trên điểm
    layer.selectAll("text")
      .data(s.values)
      .join("text")
        .attr("x", d => x(d.m))
        .attr("y", d => y(d.p) - 6)
        .attr("text-anchor", "middle")
        .attr("font-size", 11)
        .attr("fill", color(s.group))
        .text(d => d3.format(".0%")(d.p));
  });

  // legend
  const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${width - margin.right + 10}, ${margin.top})`);
  const leg = legend.selectAll("g")
    .data(series.map(s=>s.group))
    .join("g")
      .attr("transform", (d,i)=>`translate(0, ${i*20})`);
  leg.append("rect").attr("width", 12).attr("height", 12).attr("fill", d=>color(d));
  leg.append("text").attr("x", 16).attr("y", 10).text(d=>d);
})();
