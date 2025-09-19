// Q2: Doanh số theo Nhóm hàng
const CSV_PATH = "../data/data_ggsheet_data.csv";
const fmtVNDTrieu = v => d3.format(",.0f")(v/1e6) + " triệu VND";
const toNumber = v => +String(v ?? "").replace(/[^\d.-]/g, "");
const fmtInt = v => d3.format(",.0f")(v);

// Tooltip div
const tip = d3.select("#tt");

(async function () {
  // Đọc CSV: tự nhận , hoặc ;
  const txt = await d3.text(CSV_PATH);
  const sep = (txt.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  const dsv = d3.dsvFormat(sep);
  const rows = dsv.parse(txt);

  // Map cột
  const mapped = rows.map(r => {
    const maNH  = (r["Mã nhóm hàng"]  ?? "").trim();
    const tenNH = (r["Tên nhóm hàng"] ?? "").trim();
    return {
      groupKey: maNH,
      group   : `[${maNH}] ${tenNH}`,
      value   : toNumber(r["Thành tiền"]),
      qty     : Number.isFinite(toNumber(r["SL"])) ? toNumber(r["SL"]) : null // lấy SL
    };
  }).filter(d => d.groupKey && d.group && Number.isFinite(d.value));

  // Gộp theo nhóm hàng (sum value & sum qty nếu có)
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
  );

  // Sort giảm dần
  agg.sort((a, b) => d3.descending(a.value, b.value));
  const data = agg;

  // Vẽ bar chart ngang
  const margin = { top: 20, right: 220, bottom: 20, left: 220 };
  const barH = 34, gap = 8;
  const width = Math.max(1000, document.querySelector("#chart").clientWidth || 1000);
  const height = margin.top + margin.bottom + data.length * barH;

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.value)]).nice()
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.group))
    .range([margin.top, height - margin.bottom])
    .paddingInner(gap / barH);

  const color = d3.scaleOrdinal(d3.schemeTableau10)
    .domain(data.map(d => d.group));

  const svg = d3.select("#chart").html("").append("svg")
    .attr("width", width)
    .attr("height", height);

  // grid dọc
  svg.append("g")
    .attr("transform", `translate(0,${margin.top})`)
    .call(d3.axisTop(x).ticks(6)
      .tickSize(-(height - margin.top - margin.bottom))
      .tickFormat(""))
    .call(g => g.select(".domain").remove())
    .selectAll(".tick line").attr("stroke","#000").attr("stroke-opacity",0.06);

  // trục y
  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove());

  // bars + tooltip
  svg.append("g").selectAll("rect")
    .data(data).join("rect")
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
      tip.style("left", (event.clientX + pad) + "px")
         .style("top",  (event.clientY + pad) + "px");
    })
    .on("pointerleave", () => tip.style("opacity", 0));

  // nhãn giá trị
  svg.append("g").selectAll("text.value")
    .data(data).join("text")
    .attr("class","value")
    .attr("x", d => x(d.value) + 6)
    .attr("y", d => y(d.group) + y.bandwidth()/2)
    .attr("dy",".35em").attr("font-size",12).attr("fill","#333")
    .text(d => fmtVNDTrieu(d.value));
})();
