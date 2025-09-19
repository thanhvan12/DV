// Q12 – Phân phối Mức chi trả của Khách hàng
const CSV_PATH      = "../data/data_ggsheet_data.csv";
const CUSTOMER_COL  = "Mã khách hàng";
const SALES_COL     = "Thành tiền";
const BIN_STEP = 50_000;

/* helpers */
async function loadCSV(path){
  const raw = await d3.text(path);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  return d3.dsvFormat(sep).parse(raw);
}
function parseMoney(v){
  if (v == null || v === "") return 0;
  const s = String(v).replace(/[^0-9.-]/g, "");
  const n = +s;
  return isNaN(n) ? 0 : n;
}
const fmtInt = d3.format(",");           // 1,528
const tip = d3.select("#tt");

(async function run(){
  const rows = await loadCSV(CSV_PATH);
  if (!rows.length){
    d3.select("#chart").text("Không có dữ liệu."); return;
  }
  if (!(CUSTOMER_COL in rows[0]) || !(SALES_COL in rows[0])){
    d3.select("#chart").append("p")
      .style("color","crimson")
      .text(`Thiếu cột "${CUSTOMER_COL}" hoặc "${SALES_COL}".`);
    return;
  }

  // 1) Tổng chi tiêu theo khách
  const spendByCustomer = new Map();
  for (const r of rows){
    const kh = String(r[CUSTOMER_COL] ?? "").trim();
    if (!kh) continue;
    const sales = parseMoney(r[SALES_COL]);
    spendByCustomer.set(kh, (spendByCustomer.get(kh) || 0) + sales);
  }
  const totals = Array.from(spendByCustomer.values());
  if (!totals.length){
    d3.select("#chart").text("Không có tổng chi tiêu hợp lệ."); return;
  }

  // 2) Bins
  const maxTotal = d3.max(totals) || 0;
  const maxEdge  = Math.ceil(maxTotal / BIN_STEP) * BIN_STEP;
  const bins = d3.bin()
    .domain([0, maxEdge])
    .thresholds(d3.range(0, maxEdge + BIN_STEP, BIN_STEP))(totals);

  // 3) Data cho vẽ
  const data = bins.map(b => ({
    x0: b.x0, x1: b.x1,
    label: fmtInt(Math.round(b.x0)),      // dùng cho tick trục X (nhưng tooltip sẽ dùng range)
    SoKhach: b.length
  }));

  // 4) Vẽ chart
  const margin = { top: 54, right: 20, bottom: 80, left: 74 };
  const width  = Math.max(1400, (document.querySelector("#chart").clientWidth || 1200));
  const height = 560;

  const svg = d3.select("#chart").html("").append("svg")
    .attr("width", width).attr("height", height);

  const x = d3.scaleBand()
    .domain(data.map(d => d.label))
    .range([margin.left, width - margin.right])
    .padding(0.12);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.SoKhach) || 0]).nice()
    .range([height - margin.bottom, margin.top]);

  // Grid
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
    .call(g => g.selectAll(".tick line").attr("stroke", "#000").attr("stroke-opacity", 0.05))
    .call(g => g.select(".domain").remove());

  // Bars + tooltip
  svg.append("g").selectAll("rect")
    .data(data).join("rect")
      .attr("x", d => x(d.label))
      .attr("y", d => y(d.SoKhach))
      .attr("width", x.bandwidth())
      .attr("height", d => (height - margin.bottom) - y(d.SoKhach))
      .attr("fill", "steelblue")
      .on("pointerenter", (ev, d) => {
        const html =
          `<div><b>Đã chi tiêu Từ ${fmtInt(d.x0)} đến ${fmtInt(d.x1)}</b></div>
           <div class="sub">Số lượng KH: ${fmtInt(d.SoKhach)}</div>`;
        tip.html(html).style("display", "block");
      })
      .on("pointermove", (ev) => {
        const pad = 12;
        tip.style("left", (ev.clientX + pad) + "px")
           .style("top",  (ev.clientY + pad) + "px");
      })
      .on("pointerleave", () => tip.style("display", "none"));

  // Axis X (xoay nhãn)
  const gx = svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x));
  gx.selectAll("text")
    .attr("font-size", 11)
    .attr("text-anchor", "end")
    .attr("transform", "rotate(-90)")
    .attr("dx", "-0.4em")
    .attr("dy", "0.25em");

  // Axis Y
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickFormat(d3.format(",")))
    .selectAll("text").attr("font-size", 12);

  // Label Y
  svg.append("text")
    .attr("x", margin.left - 56)
    .attr("y", margin.top - 18)
    .attr("font-size", 13)
    .attr("font-weight", "600")
    .text("Số khách hàng");
})();
