// Screenshot the canvas at chosen beats: `npm run shoot`.
//
// Uses `?frame=n` so every run captures the identical state — a timer-driven
// animation screenshots differently every time and is useless for spotting a
// regression. Console errors are reported too; a blank canvas is far more often a
// thrown exception than a layout bug.
//
//   npm run shoot                 the default beats
//   npm run shoot -- 12 20 37     specific beats

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = process.env.OUT ?? "shots";

// The beats worth looking at, by event index (see run.ts for the order).
const DEFAULT_BEATS: Array<[number, string]> = [
  [1, "01-goal-only"],
  [3, "02-flights-listed"],
  [4, "03-deliberating"],
  [7, "04-flights-paying"],
  [10, "05-flights-answered"],
  [21, "06-hotels-answered"],
  [31, "07-handoff"],
  [37, "08-complete"],
];

async function main() {
  const argv = process.argv.slice(2).map(Number).filter(Boolean);
  const beats: Array<[number, string]> = argv.length
    ? argv.map((n) => [n, `frame-${String(n).padStart(2, "0")}`])
    : DEFAULT_BEATS;

  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });

  const problems: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));

  for (const [frame, name] of beats) {
    await page.goto(`${BASE}/?frame=${frame}`, { waitUntil: "networkidle" });
    // Let the CSS transitions (opacity/width, 400–600ms) settle before capturing.
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`  ${OUT}/${name}.png   (frame ${frame})`);
  }

  // How much of the board is actually inside the viewport? This is the layout
  // question I can't answer by reading the code.
  await page.goto(`${BASE}/?frame=37`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const clipped = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return [...document.querySelectorAll(".react-flow__node")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const id = el.getAttribute("data-id") ?? "?";
        const out: string[] = [];
        if (r.left < 0) out.push("left");
        if (r.top < 0) out.push("top");
        if (r.right > vw) out.push("right");
        if (r.bottom > vh) out.push("bottom");
        return out.length ? `${id} clipped ${out.join("+")}` : null;
      })
      .filter(Boolean) as string[];
  });

  // Overlapping nodes are the failure mode you cannot see by reading the layout
  // constants: a card grows taller in a later state and quietly slides under its
  // neighbour, hiding whatever is at the bottom of it.
  const overlaps = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".react-flow__node")].map((el) => ({
      id: el.getAttribute("data-id") ?? "?",
      r: el.getBoundingClientRect(),
    }));
    const hits: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        // 2px of tolerance: adjacent borders can round into each other.
        if (ox > 2 && oy > 2) {
          hits.push(`${a.id} ↔ ${b.id} (${Math.round(ox)}×${Math.round(oy)}px)`);
        }
      }
    }
    return hits;
  });

  const counts = await page.evaluate(() => ({
    nodes: document.querySelectorAll(".react-flow__node").length,
    edges: document.querySelectorAll(".react-flow__edge").length,
    labels: document.querySelectorAll(".react-flow__edge-text").length,
  }));

  await browser.close();

  console.log(`\nrendered: ${counts.nodes} nodes, ${counts.edges} edges, ${counts.labels} edge labels`);
  if (clipped.length) {
    console.log(`\n⚠ outside the viewport at 1680×1000:`);
    for (const c of clipped) console.log(`   ${c}`);
  } else {
    console.log(`✓ every node inside the viewport at 1680×1000`);
  }
  if (overlaps.length) {
    console.log(`\n⚠ overlapping nodes — something is being covered up:`);
    for (const o of overlaps) console.log(`   ${o}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ no overlapping nodes`);
  }
  if (problems.length) {
    console.log(`\n✗ ${problems.length} console problem(s):`);
    for (const p of [...new Set(problems)]) console.log(`   ${p}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ no console errors`);
  }
}

void main();
