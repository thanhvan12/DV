// Q10 – Xác suất bán hàng theo Nhóm hàng & Tháng
const CSV_PATH = "../data/data_ggsheet_data.csv";

const DATE_COL  = "Thời gian tạo đơn";
const ORDER_COL = "Mã đơn hàng";
const GCODE_COL = "Mã nhóm hàng";
const GNAME_COL = "Tên nhóm hàng";
const ITCODE_COL= "Mã mặt hàng";
const ITNAME_COL= "Tên mặt hàng";

async function loadCSV(path){
  const raw = await d3.text(path);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  return d3.dsvFormat(sep).parse(raw);
}
const tidy = v => String(v ?? "").trim();
const parseHMS = d3.timeParse("%Y-%m-%d %H:%M:%S");      // Y-m-d H:M:S
const parseYMD = d3.timeParse("%Y-%m-%d");               // Y-m-d
const pDMY     = d3.timeParse("%d/%m/%Y");               // d/m/Y
const pMDY     = d3.timeParse("%m/%d/%Y");               // m/d/Y
const fromExcelSerial = n => new Date(Math.round((+n - 25569) * 86400000) + 12*3600*1000);
const fmtInt = v => d3.format(",.0f")(v);

function parseDateAny(v){
  if (v == null || v === "") return null;
  if (!isNaN(v)) {
    const n = +v; if (n > 10000) return fromExcelSerial(n);
  }
  const s = String(v).trim();
  return parseHMS(s) || parseYMD(s) || pDMY(s) || pMDY(s) || null;
}

(async function run(){
  const chart = d3.select("#chart");
  const rows  = await loadCSV(CSV_PATH);

  // Chuẩn hoá input
  const data = rows.map(r=>{
    const order = tidy(r[ORDER_COL]);
    const gcode = tidy(r[GCODE_COL]);
    const gname = tidy(r[GNAME_COL]);
    const icode = tidy(r[ITCODE_COL]);
    const iname = tidy(r[ITNAME_COL]);
    const dt    = parseDateAny(r[DATE_COL]);

    const m = dt ? "T"+String(dt.getMonth()+1).padStart(2,"0") : null; // "T01".."T12"
    return {
      order,
      group:`[${gcode}] ${gname}`,
      item:`[${icode}] ${iname}`,
      month:m
    };
  }).filter(d=>d.order && d.group && d.item && d.month);

  const groups = d3.group(data, d=>d.group);
  const color = d3.scaleOrdinal(d3.schemeTableau10);
  const tip = d3.select("body").append("div").attr("class","tooltip");

  groups.forEach((arr,g)=>{

    // Mẫu số: DISTINCTCOUNT đơn theo tháng trong NHÓM
    const denomMap = d3.rollup(
      arr, v => new Set(v.map(d=>d.order)).size,
      d => d.month
    );

    // Tử số: DISTINCTCOUNT đơn theo (tháng, mặt hàng) trong NHÓM
    const numMap = d3.rollup(
      arr,
      v => new Set(v.map(d => d.order)).size,
      d => d.month,
      d => d.item
    );

    // Records mỗi điểm (tháng, mặt hàng)
    let recs = [];
    numMap.forEach((itemMap, m) => {
      const denom = denomMap.get(m) || 0;
      itemMap.forEach((cnt, item) => {
        const prob = denom ? cnt / denom : 0;
        recs.push({ group: g, month: m, item, prob, cnt, denom });
      });
    });

    const months=[...new Set(recs.map(d=>d.month))].sort();
    const items =[...new Set(recs.map(d=>d.item))];

    // container subplot
    const container = chart.append("div").attr("class","subplot");
    container.append("h3").text(g);
    const svg=container.append("svg").attr("class","chart-area")
      .attr("width",400).attr("height",220);

    const margin={top:10,right:20,bottom:30,left:44};
    const innerW=+svg.attr("width")-margin.left-margin.right;
    const innerH=+svg.attr("height")-margin.top-margin.bottom;
    const gWrap=svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);

    const x=d3.scalePoint().domain(months).range([0,innerW]).padding(0.5);
    const y=d3.scaleLinear()
              .domain([0, d3.max(recs,d=>d.prob)||1])
              .nice()
              .range([innerH,0]);

    // axes
    gWrap.append("g")
      .attr("transform",`translate(0,${innerH})`)
      .call(d3.axisBottom(x));
    gWrap.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%"))); // %.0

    // line per item
    const line=d3.line().x(d=>x(d.month)).y(d=>y(d.prob));
    d3.group(recs,d=>d.item).forEach(vals=>{
      gWrap.append("path")
        .datum(vals.sort((a,b)=>d3.ascending(a.month,b.month)))
        .attr("fill","none").attr("stroke",color(vals[0].item)).attr("stroke-width",2)
        .attr("d",line);
    });

    // points + tooltip
    gWrap.selectAll("circle").data(recs).join("circle")
      .attr("cx",d=>x(d.month)).attr("cy",d=>y(d.prob)).attr("r",3.2)
      .attr("fill",d=>color(d.item))
      .on("pointerenter",(ev,d)=>{
        const html =
          `<div><b>${d.month} | Mặt hàng ${d.item}</b></div>
           <div class="sub">Nhóm hàng: ${d.group} &nbsp; | &nbsp; SL Đơn Bán: ${fmtInt(d.cnt)}</div>
           <div class="sub">Xác suất Bán / Nhóm hàng: ${d3.format(".1%")(d.prob)}</div>`;
        tip.html(html).style("display","block");
      })
      .on("pointermove",(ev)=>{
        const pad=12;
        tip.style("left",(ev.clientX+pad)+"px").style("top",(ev.clientY+pad)+"px");
      })
      .on("pointerleave",()=>tip.style("display","none"));

    // legend
    const legend=container.append("div").attr("class","legend");
    items.forEach(it=>{
      const li=legend.append("div").attr("class","legend-item");
      li.append("div").attr("class","legend-color").style("background",color(it));
      li.append("span").text(it);
    });
  });
})();
