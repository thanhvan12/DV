// Q9 – Xác suất bán hàng của Mặt hàng theo Nhóm hàng
const CSV_PATH = "../data/data_ggsheet_data.csv";

const COL = {
  order: "Mã đơn hàng",
  gcode: "Mã nhóm hàng",
  gname: "Tên nhóm hàng",
  itemCode: "Mã mặt hàng",
  itemName: "Tên mặt hàng",
  groupBoth: "Mã và tên nhóm hàng"
};

/* ---------- helpers ---------- */
async function loadCSV(path) {
  const raw = await d3.text(path);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  return d3.dsvFormat(sep).parse(raw);
}
const tidy = v => String(v ?? "").trim();
const needCols = (rows, cols) => cols.every(c => c in rows[0]);
const fmtInt = v => d3.format(",.0f")(v);

/* ---------- main ---------- */
(async function run () {
  const chart = d3.select("#chart");
  const rows  = await loadCSV(CSV_PATH);

  if (!rows.length){
    chart.append("div").attr("class","note").text("Không có dữ liệu CSV.");
    return;
  }

  const must = [COL.order, COL.itemCode, COL.itemName];
  if (!needCols(rows, must)){
    chart.append("div").attr("class","note")
      .text(`Thiếu cột trong CSV. Cần tối thiểu: ${must.join(" · ")}`);
    return;
  }

  // Chuẩn hóa bản ghi
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

  // Nhóm theo Nhóm hàng
  const byGroup = d3.group(data, d => d.group);
  const groups  = Array.from(byGroup.keys()).sort(d3.ascending);

  // Màu ổn định giữa các subplot
  const color = d3.scaleOrdinal().range(d3.schemeTableau10);

  // Tooltip (dùng div đã có trong HTML)
  const tip = d3.select("body").append("div").attr("class","tooltip");

  groups.forEach(groupName => {
    const arr = byGroup.get(groupName);

    // Denominator = DISTINCTCOUNT đơn trong nhóm
    const denom = new Set(arr.map(d => d.order)).size;

    // Numerator theo từng mặt hàng trong nhóm
    const orderByItem = d3.rollup(
      arr,
      v => new Set(v.map(d => d.order)).size,
      d => d.item
    );

    let items = Array.from(orderByItem, ([name, numer]) => ({
      name,
      numer,
      denom,
      proba: denom ? numer / denom : 0
    })).sort((a,b) => d3.descending(a.proba, b.proba));

    // ----- Vẽ card -----
    const card  = chart.append("div").attr("class","subplot");
    card.append("h3").text(groupName);

    if (!denom){
      card.append("div").attr("class","note").text("Không có đơn hàng trong nhóm này.");
      return;
    }

    const longestName = d3.max(items, d => d.name.length) || 10;
    const leftPad     = Math.min(260, Math.max(180, longestName * 6.2));

    const margin = { top: 6, right: 90, bottom: 34, left: leftPad };
    const outerW = 440;
    const W      = outerW - margin.left - margin.right;
    const H      = Math.max(150, items.length * 26);

    const svg = card.append("svg")
      .attr("width",  outerW)
      .attr("height", H + margin.top + margin.bottom);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Thang đo
    const xMax = d3.max(items, d => d.proba) || 0.01;
    const x = d3.scaleLinear().domain([0, xMax * 1.06]).range([0, W]);
    const y = d3.scaleBand().domain(items.map(d => d.name)).range([0, H]).padding(0.12);

    // Trục
    g.append("g").attr("class","axis").call(d3.axisLeft(y));
    g.append("g").attr("class","axis")
      .attr("transform", `translate(0,${H})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format(".0%")));

    // Cột
    const bars = g.selectAll("rect").data(items).join("rect")
      .attr("x", 0)
      .attr("y", d => y(d.name))
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.proba))
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

        tip.html(html)
           .style("display","block")
           .style("opacity", 1);
      })
      .on("pointermove", (ev) => {
        const pad = 12;
        tip.style("left", (ev.clientX + pad) + "px")
           .style("top",  (ev.clientY + pad) + "px");
      })
      .on("pointerleave", function(){
        d3.select(this).attr("stroke", null).attr("stroke-width", null);
        tip.style("display","none").style("opacity", 0);
      });

    // Nhãn %
    g.selectAll("text.value").data(items).join("text")
      .attr("class","value")
      .attr("x", d => x(d.proba) + 6)
      .attr("y", d => y(d.name) + y.bandwidth()/2)
      .attr("dy",".35em")
      .text(d => d3.format(".1%")(d.proba));
  });
})();
