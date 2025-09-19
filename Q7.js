// Q7 – Xác suất bán hàng theo Nhóm hàng
const CSV_PATH    = "../data/data_ggsheet_data.csv";
const ORDER_COL   = "Mã đơn hàng";
const GROUP_CODE  = "Mã nhóm hàng";
const GROUP_NAME  = "Tên nhóm hàng";

const tip = d3.select("#tt");
const fmtInt = v => d3.format(",.0f")(v);

async function loadCSV(path) {
  const raw = await d3.text(path);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  return d3.dsvFormat(sep).parse(raw);
}

(async function run() {
  const rows = await loadCSV(CSV_PATH);
  if (!rows.length) {
    d3.select("#chart").text("Không có dữ liệu."); 
    return;
  }

  // Tổng số đơn (distinct)
  const totalOrders = new Set(rows.map(r => String(r[ORDER_COL]).trim())).size;

  const keyOf = r => {
    const code = String(r[GROUP_CODE] ?? "").trim();
    const name = String(r[GROUP_NAME] ?? "").trim();
    return `[${code}] ${name}`.trim();
  };

  // Map nhóm -> Set đơn hàng
  const groupToOrderSet = new Map();
  for (const r of rows) {
    const key = keyOf(r);
    const ord = String(r[ORDER_COL]).trim();
    if (!key || !ord) continue;
    if (!groupToOrderSet.has(key)) groupToOrderSet.set(key, new Set());
    groupToOrderSet.get(key).add(ord);
  }

  // Tính xác suất + số đơn
  let data = Array.from(groupToOrderSet, ([group, ids]) => ({
    group,
    count: ids.size,
    p: totalOrders ? ids.size / totalOrders : 0
  }));

  data.sort((a,b) => d3.descending(a.p, b.p));

  const margin = { top: 10, right: 90, bottom: 40, left: 180 };
  const width  = Math.max(980, (document.querySelector("#chart").clientWidth || 980));
  const height = margin.top + margin.bottom + data.length * 54;

  const svg = d3.select("#chart").html("").append("svg")
    .attr("width",  width)
    .attr("height", height);

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.p) || 1]).nice()
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.group))
    .range([margin.top, height - margin.bottom])
    .padding(0.25);

  const color = d3.scaleOrdinal()
    .domain(data.map(d => d.group))
    .range(d3.schemeTableau10);

  // Trục X (%)
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format(".0%")))
    .call(g => g.select(".domain").remove());

  // Trục Y
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove());

  // Lưới
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke", "#000").attr("stroke-opacity", 0.06);

  // Thanh + tooltip
  svg.append("g").selectAll("rect")
    .data(data).join("rect")
      .attr("x", x(0))
      .attr("y", d => y(d.group))
      .attr("width", d => x(d.p) - x(0))
      .attr("height", y.bandwidth())
      .attr("fill", d => color(d.group))
      .on("pointerenter", (event,d) => {
        const html =
          `<div><b>Nhóm hàng:</b> <span class="v">${d.group}</span></div>
           <div><b>SL Đơn Bán:</b> <span class="v">${fmtInt(d.count)}</span></div>
           <div><b>Xác suất Bán:</b> <span class="v">${d3.format(".1%")(d.p)}</span></div>`;
        tip.html(html).style("opacity",1);
      })
      .on("pointermove", (event) => {
        const pad = 12;
        tip.style("left",(event.clientX+pad)+"px").style("top",(event.clientY+pad)+"px");
      })
      .on("pointerleave", () => tip.style("opacity",0));

  // Nhãn %
  svg.append("g").selectAll("text.label")
    .data(data).join("text")
      .attr("x", d => x(d.p) + 8)
      .attr("y", d => y(d.group) + y.bandwidth()/2 + 4)
      .attr("fill", "#333")
      .attr("font-size", 12)
      .text(d => d3.format(".1%")(d.p));
})();
