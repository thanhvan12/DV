// Q11 – Phân phối Lượt mua hàng (theo công thức Power BI)

const CSV_PATH     = "../data/data_ggsheet_data.csv";
const CUSTOMER_COL = "Mã khách hàng";
const ORDER_COL    = "Mã đơn hàng";

async function loadCSV(path){
  const raw = await d3.text(path);
  const sep = (raw.split(/\r?\n/)[0] || "").includes(";") ? ";" : ",";
  return d3.dsvFormat(sep).parse(raw);
}

(async function run(){
  const rows = await loadCSV(CSV_PATH);
  if (!rows.length){ d3.select("#chart").text("Không có dữ liệu."); return; }

  if (!(CUSTOMER_COL in rows[0]) || !(ORDER_COL in rows[0])){
    d3.select("#chart").append("p").style("color","crimson")
      .text(`Thiếu cột "${CUSTOMER_COL}" hoặc "${ORDER_COL}".`);
    return;
  }

  // DISTINCTCOUNT đơn theo KH
  const map = new Map();
  for (const r of rows){
    const kh = String(r[CUSTOMER_COL] ?? "").trim();
    const od = String(r[ORDER_COL] ?? "").trim();
    if (!kh || !od) continue;
    if (!map.has(kh)) map.set(kh, new Set());
    map.get(kh).add(od);
  }
  const perCustomer = Array.from(map, ([kh, set]) => ({kh, SoLuotMua: set.size}));

  // Phân phối
  const freq = d3.rollup(perCustomer, v => v.length, d => d.SoLuotMua);
  const data = Array.from(freq, ([SoLuotMua, SoKhach]) => ({SoLuotMua, SoKhach}))
    .sort((a,b)=>d3.ascending(a.SoLuotMua,b.SoLuotMua));

  // Chart
  const margin = {top:50,right:20,bottom:50,left:70};
  const width  = Math.max(1100,(document.querySelector("#chart").clientWidth||1100));
  const height = 520;

  const svg = d3.select("#chart").html("").append("svg")
    .attr("width",width).attr("height",height);

  const x = d3.scaleBand()
    .domain(data.map(d=>String(d.SoLuotMua)))
    .range([margin.left,width-margin.right])
    .padding(0.2);

  const y = d3.scaleLinear()
    .domain([0,d3.max(data,d=>d.SoKhach)||0]).nice()
    .range([height-margin.bottom,margin.top]);

  // Grid ngang
  svg.append("g")
    .attr("transform",`translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickSize(-(width-margin.left-margin.right)).tickFormat(""))
    .call(g => g.selectAll(".tick line").attr("stroke","#000").attr("stroke-opacity",0.05))
    .call(g => g.select(".domain").remove());

  // Tooltip
  const tip = d3.select("#tt");
  const fmtInt = d3.format(",");

  // Bars + tooltip
  svg.append("g").selectAll("rect")
    .data(data).join("rect")
      .attr("x",d=>x(String(d.SoLuotMua)))
      .attr("y",d=>y(d.SoKhach))
      .attr("width",x.bandwidth())
      .attr("height",d=>(height-margin.bottom)-y(d.SoKhach))
      .attr("fill","steelblue")
      .on("pointerenter",(ev,d)=>{
        tip.style("display","block").html(
          `<div><b>Đã mua ${d.SoLuotMua} lần</b></div>
           <div>Số lượng KH: ${fmtInt(d.SoKhach)}</div>`
        );
      })
      .on("pointermove",(ev)=>{
        tip.style("left",(ev.clientX+12)+"px").style("top",(ev.clientY-28)+"px");
      })
      .on("pointerleave",()=>tip.style("display","none"));

  // Axis X
  svg.append("g")
    .attr("transform",`translate(0,${height-margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll("text").attr("font-size",12);

  // Axis Y
  svg.append("g")
    .attr("transform",`translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(8).tickFormat(d3.format(",")))
    .selectAll("text").attr("font-size",12);

  // Nhãn Y
  svg.append("text")
    .attr("x",margin.left-50)
    .attr("y",margin.top-20)
    .attr("font-size",13)
    .attr("font-weight","600")
    .text("Số khách hàng");
})();
