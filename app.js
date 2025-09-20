/* ========= CONFIG ========= */
const CSV_PATH = "data_ggsheet_data.csv";   // file CSV duy nhất
const TOTAL = 12;                            // Q1..Q12
const PREFIX = "Q";

/* ========= NAV & ROUTER ========= */
const nav = document.getElementById("nav");
const pageTitle = document.getElementById("pageTitle");
const openLink = document.getElementById("openLink");
const view = document.getElementById("view");
const tip = d3.select("#tt");                // tooltip dùng chung

const btns = [];
for (let i = 1; i <= TOTAL; i++) {
  const b = document.createElement("button");
  b.className = "q";
  b.textContent = PREFIX + i;
  b.dataset.q = i;
  b.onclick = () => gotoQ(i, true);
  nav.insertBefore(b, nav.querySelector(".spacer"));
  btns.push(b);
}

function setActive(i){
  btns.forEach(b => b.classList.toggle("active", +b.dataset.q === +i));
  openLink.href = `#${PREFIX}${i}`;
  openLink.textContent = `Mở ${PREFIX}${i} trong tab mới`;
}

function gotoQ(i, pushHash=false){
  // lưu lại Q cuối xem
  localStorage.setItem("lastQ", i);
  if (pushHash) location.hash = `#${PREFIX}${i}`;
  else renderQ(i);
}

function initFromHash(){
  const m = (location.hash || "").toUpperCase().match(/^#Q(\d{1,2})$/);
  return m ? Math.min(TOTAL, Math.max(1, +m[1])) : (+localStorage.getItem("lastQ") || 1);
}

window.addEventListener("hashchange", () => renderQ(initFromHash()));
window.addEventListener("keydown", (e) => {
  const cur = +localStorage.getItem("lastQ") || 1;
  if (e.key === "ArrowRight") gotoQ(Math.min(TOTAL, cur + 1), true);
  if (e.key === "ArrowLeft")  gotoQ(Math.max(1, cur - 1), true);
});

/* ========= HELPERS ========= */
function clearView(){
  view.innerHTML = "";    // xoá nội dung cũ
  tip.style("opacity", 0);
}
const tidy = v => String(v ?? "").trim();

/* ========= RENDER SWITCH ========= */
function renderQ(i){
  clearView(); setActive(i);
  pageTitle.textContent = ""; // mặc định xoá

  switch(i){
    case 1: return renderQ1();
    case 2: return renderPlaceholder("Q2");     // TODO: thay bằng renderQ2()
    case 3: return renderPlaceholder("Q3");
    case 4: return renderPlaceholder("Q4");
    case 5: return renderPlaceholder("Q5");
    case 6: return renderPlaceholder("Q6");
    case 7: return renderPlaceholder("Q7");
    case 8: return renderPlaceholder("Q8");
    case 9: return renderPlaceholder("Q9");
    case 10: return renderPlaceholder("Q10");
    case 11: return renderPlaceholder("Q11");
    case 12: return renderPlaceholder("Q12");
  }
}

function renderPlaceholder(label){
  pageTitle.textContent = `(${label}) – Chưa paste code vào app.js`;
  const div = document.createElement("div");
  div.className = "note";
  div.textContent = `Bạn mở file ${label}.js cũ, copy toàn bộ phần D3 và đặt vào hàm render${label}() trong app.js. Xem mẫu ở renderQ1().`;
  view.appendChild(div);
}

/* ========= Q1 (ĐÃ PORT SẴN) ========= */
// Q1 – Doanh số theo Mặt hàng (từ Q1.js bạn đã dùng)
async function renderQ1(){
  pageTitle.textContent = "Doanh số bán hàng theo Mặt hàng";

  // 1) Đọc CSV + parse
  const txt = await d3.text(CSV_PATH);
  const header = (txt.split(/\r?\n/)[0] || "");
  const sep = header.includes(";") ? ";" : ",";
  const dsv = d3.dsvFormat(sep);
  const rows = dsv.parse(txt);

  // 2) Chuẩn hóa & map cột
  const toNumber = v => +String(v ?? "").replace(/[^\d.-]/g, "");
  const fmtVNDTrieu = v => d3.format(",.0f")(v / 1e6) + " triệu VND";
  const fmtInt = v => d3.format(",.0f")(v);

  const mapped = rows.map(r => {
    const maMH  = tidy(r["Mã mặt hàng"]);
    const tenMH = tidy(r["Tên mặt hàng"]);
    const maNH  = tidy(r["Mã nhóm hàng"]);
    const tenNH = tidy(r["Tên nhóm hàng"]);
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

  // 4) Sort + Top N (giữ nguyên 20 như bản cũ)
  const TOP_N = 20;
  agg.sort((a, b) => d3.descending(a.value, b.value));
  const data = TOP_N > 0 ? agg.slice(0, TOP_N) : agg;

  // ==== đo độ rộng legend để chừa lề phải ====
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

  const legendWidth = 14 + 6 + maxTextW + 24; // 14 ô màu + 6 gap + text + padding
  const margin = { top: 20, right: Math.max(240, legendWidth + 40), bottom: 20, left: 320 };
  const barH = 26, gap = 6;

  const width = Math.max(1000, view.getBoundingClientRect().width || 1000);
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

  const svg = d3.select(view).append("svg")
    .attr("width", width).attr("height", height);

  // Grid dọc nhẹ
  svg.append("g")
    .attr("transform", `translate(0,${margin.top})`)
    .call(d3.axisTop(x).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""))
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

  // Nhãn giá trị (né vùng legend)
  svg.append("g").selectAll("text.value")
    .data(data).join("text")
    .attr("class", "value")
    .attr("x", d => Math.min(x(d.value) + 6, width - margin.right - 4))
    .attr("y", d => y(d.item) + y.bandwidth()/2)
    .attr("dy",".35em")
    .attr("font-size",12).attr("fill","#333")
    .text(d => fmtVNDTrieu(d.value));

  // Legend (đặt trong vùng lề phải)
  const legend = svg.append("g")
    .attr("transform", `translate(${width - margin.right + 20}, ${margin.top})`);
  const itemH = 24;
  const items = legend.selectAll("g.item")
    .data(color.domain()).join("g")
    .attr("class","item")
    .attr("transform",(d,i)=>`translate(0, ${i*itemH})`);
  items.append("rect").attr("width",14).attr("height",14).attr("rx",2).attr("fill", d=>color(d));
  items.append("text").attr("x",20).attr("y",7).attr("dominant-baseline","middle").attr("font-size",12).text(d=>d);

  const pad = 8;
  const bbox = legend.node().getBBox();
  legend.insert("rect",":first-child")
    .attr("x",bbox.x - pad).attr("y",bbox.y - pad)
    .attr("width",bbox.width + pad*2).attr("height",bbox.height + pad*2)
    .attr("fill","#fff").attr("stroke","#e5e7eb").attr("rx",6).attr("opacity",0.98);
}

/* ========= KICK-OFF ========= */
gotoQ(initFromHash(), false);
