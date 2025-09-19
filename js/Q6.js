// Q6 – Doanh số bán hàng TRUNG BÌNH theo KHUNG GIỜ (HH:00–HH:59)
const CSV_PATH  = "../data/data_ggsheet_data.csv";
const DATE_COL  = "Thời gian tạo đơn";
const VALUE_COL = "Thành tiền";

/* helpers */
const toNumber = v => +String(v ?? "").replace(/[^\d.-]/g, "");
const toIntQty = v => {                  // parse SL chuẩn cho . , ngăn cách
  const s = String(v ?? "").trim();
  if (!s) return NaN;
  if (s.includes(".") && s.includes(",")) return +s.replace(/\./g,"").replace(",",".").replace(/[^\d.-]/g,"");
  const digits = s.replace(/[.,\s]/g,"").replace(/[^\d-]/g,"");
  return digits ? +digits : NaN;
};
const fmtVND = v => d3.format(",.0f")(v) + " VND";
const fmtInt = v => d3.format(",.0f")(v);
const tip = d3.select("#tt");

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

(async function run(){
  const raw = await d3.text(CSV_PATH);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  const dsv = d3.dsvFormat(sep);
  const rows = dsv.parse(raw);
  if (!rows.length || !(DATE_COL in rows[0]) || !(VALUE_COL in rows[0])) {
    d3.select("#chart").text("Không dò được cột ngày hoặc Thành tiền!"); return;
  }

  // Chuẩn hoá: { h (0..23), d (ngày), v, q }
  const recs = rows.map(r => {
    const dt = parseDateCell(r[DATE_COL]); if (!dt) return null;
    const v = toNumber(r[VALUE_COL]); const q = toIntQty(r["SL"]);
    if (!Number.isFinite(v) && !Number.isFinite(q)) return null;
    return { h: dt.getHours(), d: dayKey(dt), v: Number.isFinite(v)?v:0, q: Number.isFinite(q)?q:0 };
  }).filter(Boolean);

  // Cộng THEO NGÀY trong từng giờ → để lấy trung bình doanh số theo ngày
  // và đồng thời lấy luôn TỔNG SL theo giờ (không trung bình) theo yêu cầu thực tế
  // Map<hour, Map<day, {sumV, sumQ}>>  +  Map<hour, totalQ>
  const byHourDay = d3.rollup(
    recs,
    v => d3.rollup(v, vv => ({ sumV: d3.sum(vv, d => d.v), sumQ: d3.sum(vv, d => d.q) }), d => d.d),
    d => d.h
  );
  const totalQtyByHour = d3.rollup(recs, v => d3.sum(v, d => d.q), d => d.h); // ← tổng SL theo giờ

  // Tính TB doanh số theo NGÀY, và lấy tổng SL theo giờ
  const stats = d3.range(0,24).map(h => {
    const dayMap = byHourDay.get(h);
    const perDay = dayMap ? Array.from(dayMap.values()) : [];
    const avg    = perDay.length ? d3.mean(perDay, o => o.sumV) : 0;
    const sumQty = totalQtyByHour.get(h) ?? null;   // ← dùng tổng, để ra ~5,428 như bạn muốn
    return { h, label: `${String(h).padStart(2,"0")}:00-${String(h).padStart(2,"0")}:59`, avg, sumQty };
  }).filter(d => d.avg > 0 || (d.sumQty ?? 0) > 0);

  /* vẽ */
  const margin = { top: 36, right: 24, bottom: 60, left: 70 };
  const width  = Math.max(1100, document.querySelector("#chart").clientWidth || 1100);
  const height = 520;

  const x = d3.scaleBand().domain(stats.map(d => d.label))
    .range([margin.left, width - margin.right]).padding(0.18);

  const y = d3.scaleLinear().domain([0, d3.max(stats, d => d.avg)]).nice()
    .range([height - margin.bottom, margin.top]);

  const color = d3.scaleSequential(d3.interpolateTurbo).domain([0,23]);

  const svg = d3.select("#chart").html("").append("svg").attr("width",width).attr("height",height);

  svg.append("g").attr("transform",`translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x)).selectAll("text").attr("font-size",11).attr("transform","translate(0,5)");

  svg.append("g").attr("transform",`translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickFormat(d => d3.format(".0s")(d)))
    .call(g => g.select(".domain").remove());

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
})();
