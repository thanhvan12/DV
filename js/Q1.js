// js/Q1.js — Q1: Doanh số bán hàng theo Mặt hàng
const CSV_PATH = "data/data_ggsheet_data.csv";
const TOP_N = 20;
const toNumber = v => +String(v ?? "").replace(/[^\d.-]/g, "");
const fmtVNDTrieu = v => d3.format(",.0f")(v / 1e6) + " triệu VND";
const fmtInt = v => d3.format(",.0f")(v);

// Tooltip div
const tip = d3.select("#tt");

(async function () {
  // 1) Đọc CSV
  const txt = await d3.text(CSV_PATH);
  const header = (txt.split(/\r?\n/)[0] || "");
  const sep = header.includes(";") ? ";" : ",";
  const dsv = d3.dsvFormat(sep);
  const rows = dsv.parse(txt);

  // 2) Map cột & làm sạch
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

  // 3) Gộp theo mặt hàng
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
  );

  // 4) Sort + Top N
  agg.sort((a, b) => d3.descending(a.value, b.value));
  const data = TOP_N > 0 ? agg.slice(0, TOP_N) : agg;

  // === đo độ rộng legend & chừa lề phải ===
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

  const legendWidth = 14 + 6 + maxTextW + 24;
  const margin = { top: 20, right: 300, bottom: 20, left: 260 };
  const barH = 26, gap = 6;

  const container = document.querySelector("#chart");
  const width = Math.max(1000, Math.floor(container.getBoundingClientRect().width) || 1000);
  const height = margin.top + margin.bottom + data.length * barH;

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.value)]).nice()
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.item))
    .range([margin.top, height - margin.bottom])
    .paddingInner(gap / barH);

  const color = d3.scaleOrdinal(d3.schemeTableau10)
    .domain(groups);

  const svg = d3.select("#chart").html("").append("svg")
    .attr("width", width)
    .attr("height", height);

  // Grid dọc nhẹ
  svg.append("g")
    .attr("transform", `translate(0,${margin.top})`)
    .call(d3.axisTop(x).ticks(6)
      .tickSize(-(height - margin.top - margin.bottom))
      .tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke", "#000").attr("stroke-opacity", 0.06);

  // Trục Y
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove());

  // Bars + tooltip
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
      tip.style("left", (event.clientX + pad) + "px")
         .style("top",  (event.clientY + pad) + "px");
    })
    .on("pointerleave", () => tip.style("opacity", 0));

  // Nhãn giá trị
  svg.append("g").selectAll("text.value")
    .data(data).join("text")
    .attr("class", "value")
    .attr("x", d => Math.min(x(d.value) + 6, width - margin.right - 4)) // tránh đè legend
    .attr("y", d => y(d.item) + y.bandwidth() / 2)
    .attr("dy", ".35em")
    .attr("font-size", 12).attr("fill", "#333")
    .text(d => fmtVNDTrieu(d.value));

// --- Legend gọn gàng, có nền và khoảng cách lớn hơn ---
const legend = svg.append("g")
  .attr("transform", `translate(${width - margin.right + 20}, ${margin.top})`);

const itemH = 24; // khoảng cách mỗi dòng legend
const items = legend.selectAll("g.item")
  .data(color.domain())
  .join("g")
  .attr("class", "item")
  .attr("transform", (d, i) => `translate(0, ${i * itemH})`);

items.each(function (d) {
  const g = d3.select(this);
  g.append("rect")
    .attr("width", 14)
    .attr("height", 14)
    .attr("rx", 2)
    .attr("fill", color(d));

  g.append("text")
    .attr("x", 20)
    .attr("y", 7)
    .attr("dominant-baseline", "middle")
    .attr("font-size", 12)
    .text(d);
});

// nền legend (đặt sau khi có nội dung để đo bbox)
const pad = 8;
const bbox = legend.node().getBBox();
legend.insert("rect", ":first-child")
  .attr("x", bbox.x - pad)
  .attr("y", bbox.y - pad)
  .attr("width", bbox.width + pad * 2)
  .attr("height", bbox.height + pad * 2)
  .attr("fill", "#fff")
  .attr("stroke", "#e5e7eb")
  .attr("rx", 6)
  .attr("opacity", 0.98);
})();

