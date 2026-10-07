// Lists UI text without English: every $t("…")/$tj("…") key in src that src/i18n/en.json lacks, and entries no longer
// used in src (server texts stay: they are matched at run time). node scripts/i18n-check.mjs [--strict] exits 1 on missing.
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const en = JSON.parse(fs.readFileSync(path.join(root, "src/i18n/en.json"), "utf8"));
const used = new Map();
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (!/node_modules|extensions|components\/ui/.test(p)) walk(p); continue; }
    if (!/\.(tsx?)$/.test(f)) continue;
    const src = fs.readFileSync(p, "utf8");
    for (const m of src.matchAll(/\$tj?\("((?:[^"\\]|\\.)*)"/g)) {
      const key = JSON.parse(`"${m[1]}"`);
      if (!used.has(key)) used.set(key, path.relative(root, p));
    }
  }
})(path.join(root, "src"));
// Texts that go to AI or the Agent rather than people; they follow the project language instead (see DEVELOPMENT).
const missing = [...used].filter(([k]) => !(k in en) && /[一-鿿]/.test(k) && k.length < 400);
console.log(`${used.size} texts in the UI, ${missing.length} without English`);
for (const [k, f] of missing) console.log(`  ${f}: ${k.slice(0, 100)}`);
if (process.argv.includes("--strict") && missing.length) process.exit(1);
