// Run: node id3-22401340.cjs
'use strict';

const studentId = '22401340';
const [A, B, C, D] = studentId.slice(-4).split('').map(Number);
const yesNo = value => value ? 'Yes' : 'No';
const money = value => value ? 'High' : 'Low';
const attributes = ['Money', 'Relationship', 'Weather', 'Duration', 'Transportation'];
const raw = [
  [money(C > 6), 'Yes', 'Sunny', 'Long', 'Easy', 'Yes'],
  ['High', 'No', 'Good', 'Medium', 'Easy', 'Yes'],
  ['Low', yesNo(A % 3 === 0), 'Stormy', 'Short', 'Hard', yesNo((A + C) % 2 === 0)],
  [money(D > 3), 'No', 'Sunny', 'Long', 'Easy', 'Yes'],
  ['High', 'Yes', 'Light Rain', 'Medium', 'Hard', 'No'],
  [money(C > 7), 'Yes', 'Good', 'Short', 'Easy', 'Yes'],
  ['High', yesNo(D % 2 === 0), 'Stormy', 'Long', 'Hard', 'No'],
  ['Low', 'No', 'Sunny', 'Medium', 'Easy', yesNo((D + B) % 3 === 0)]
];
const rows = raw.map((values, i) => Object.fromEntries([
  ['No.', i + 1], ...attributes.map((name, j) => [name, values[j]]), ['Trip', values[5]]
]));

function entropy(data) {
  if (!data.length) return 0;
  const yes = data.filter(row => row.Trip === 'Yes').length;
  return [yes, data.length - yes].reduce((sum, count) => {
    const p = count / data.length;
    return count ? sum - p * Math.log2(p) : sum;
  }, 0);
}

function groups(data, attribute) {
  const result = new Map();
  for (const row of data) {
    const value = row[attribute];
    if (!result.has(value)) result.set(value, []);
    result.get(value).push(row);
  }
  return result;
}

function majority(data) {
  return data.filter(row => row.Trip === 'Yes').length >= data.length / 2 ? 'Yes' : 'No';
}

function build(data, remaining, level = 1) {
  const h = entropy(data);
  console.log(`\nLEVEL ${level}: rows [${data.map(row => row['No.']).join(', ')}], H(S) = ${h.toFixed(6)}`);
  if (h === 0 || remaining.length === 0) {
    const label = majority(data);
    console.log(h === 0 ? `Pure subset -> leaf ${label}; stop.` : `No attributes left -> majority ${label}.`);
    return { label };
  }
  const scores = remaining.map(attribute => {
    const branches = groups(data, attribute);
    let conditional = 0;
    console.log(`\n${attribute}:`);
    for (const [value, subset] of branches) {
      const yes = subset.filter(row => row.Trip === 'Yes').length;
      const branchEntropy = entropy(subset);
      conditional += subset.length / data.length * branchEntropy;
      console.log(`  ${value}: ${yes} Yes, ${subset.length - yes} No; H = ${branchEntropy.toFixed(6)}`);
    }
    const gain = h - conditional;
    console.log(`  H(S|${attribute}) = ${conditional.toFixed(6)}; Gain = ${gain.toFixed(6)}`);
    return { attribute, branches, gain };
  });
  let best = scores[0];
  for (const score of scores.slice(1)) {
    if (score.gain > best.gain + 1e-12 ||
        (Math.abs(score.gain - best.gain) <= 1e-12 && score.branches.size < best.branches.size)) best = score;
  }
  console.log(`\nSelect ${best.attribute}, Gain = ${best.gain.toFixed(6)}`);
  const children = new Map();
  for (const [value, subset] of best.branches) {
    console.log(`\nBranch ${best.attribute} = ${value}`);
    children.set(value, build(subset, remaining.filter(a => a !== best.attribute), level + 1));
  }
  return { attribute: best.attribute, children, fallback: majority(data) };
}

function printTree(tree) {
  console.log(tree.attribute);
  const entries = [...tree.children];
  entries.forEach(([value, child], index) => {
    const connector = index === entries.length - 1 ? '└── ' : '├── ';
    console.log(`${connector}${value} → Go on Trip = ${child.label}`);
  });
}

function predict(tree, row) {
  if (tree.label) return tree.label;
  const child = tree.children.get(row[tree.attribute]);
  return child ? predict(child, row) : tree.fallback;
}

function renderTree(root) {
  const fs = require('node:fs');
  const path = require('node:path');
  const { execFile } = require('node:child_process');
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const entries = [...root.children];
  const width = Math.max(640, entries.length * 320);
  const rootX = width / 2;
  const leaves = entries.map(([value, child], index) => ({
    value, child, x: 160 + index * 320
  }));
  const lines = leaves.map(({ value, x }) => `
    <path d="M ${rootX} 122 L ${x} 238" fill="none" stroke="#64748b" stroke-width="2.5" marker-end="url(#arrow)"/>
    <text x="${(rootX + x) / 2}" y="172" text-anchor="middle" class="branch">${escape(value)}</text>`).join('');
  const boxes = leaves.map(({ child, x }) => `
    <rect x="${x - 125}" y="238" width="250" height="64" rx="14" fill="${child.label === 'Yes' ? '#dcfce7' : '#fee2e2'}" stroke="${child.label === 'Yes' ? '#16a34a' : '#dc2626'}" stroke-width="2"/>
    <text x="${x}" y="276" text-anchor="middle" class="node">Go on Trip = ${escape(child.label)}</text>`).join('');
  const output = path.join(__dirname, 'id3-22401340-tree.html');
  fs.writeFileSync(output, `<!doctype html>
<html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cây ID3 — ${studentId}</title>
<style>body{margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,sans-serif}main{max-width:1000px;margin:48px auto;padding:28px;background:white;border-radius:20px}h1{font-size:26px;margin:0 0 12px}p{color:#475569;line-height:1.6}.diagram{overflow:auto}svg{display:block;width:100%;min-width:600px;height:auto}.node{font-size:18px;font-weight:bold}.branch{font-size:18px;font-weight:bold;paint-order:stroke;stroke:white;stroke-width:7px;stroke-linejoin:round}</style>
<main><h1>Cây quyết định ID3 — MSSV ${studentId}</h1><p>A=${A}, B=${B}, C=${C}, D=${D}</p>
<div class="diagram"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 360">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#64748b"/></marker></defs>
${lines}<rect x="${rootX - 125}" y="58" width="250" height="64" rx="14" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/><text x="${rootX}" y="96" text-anchor="middle" class="node">${escape(root.attribute)}</text>${boxes}</svg></div>
<p>Các nhánh đều thuần nhất (Entropy = 0), nên dừng ở nút lá.</p></main></html>`, 'utf8');
  console.log(`\nGraphical tree: ${output}`);
  if (process.platform === 'win32') {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Start-Process -FilePath '${output.replace(/'/g, "''")}'`], { windowsHide: true });
  }
}

console.log(`MSSV ${studentId}: A=${A}, B=${B}, C=${C}, D=${D}`);
console.log('\nDATA TABLE');
console.table(rows);
const tree = build(rows, attributes);
console.log('\nDECISION TREE');
printTree(tree);
renderTree(tree);
console.log('\nCHECK TRAINING DATA');
const results = rows.map(row => ({ 'No.': row['No.'], Expected: row.Trip, Predicted: predict(tree, row) }));
console.table(results);
const correct = results.filter(row => row.Expected === row.Predicted).length;
console.log(`Accuracy: ${correct}/${rows.length} (${100 * correct / rows.length}%)`);
if (correct !== rows.length) process.exitCode = 1;
