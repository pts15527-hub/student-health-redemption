import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  module._compile(output.outputText, filename);
};

const { parseRedemptionMessage } = require("../lib/line/redemption-parser.ts");
const { yiNingPackagePlan } = require("../src/data/students/yi-ning.ts");

function expectOk(result) {
  if (!result.ok) {
    throw new Error(result.errors.join("\n"));
  }
  return result.data;
}

const general = expectOk(
  parseRedemptionMessage(
    `
7/1
B群 1組
D 1組
白賦美 1組
`,
    yiNingPackagePlan,
    { defaultYear: 2026 },
  ),
);

assert.equal(general.date, "2026-07-01");
assert.equal(general.creditUsed, 3);
assert.equal(general.totalBoxes, 11);
assert.match(general.confirmationText, /活力 BB EX 1 組｜規則：5盒一組｜本次 5 盒/);
assert.match(general.confirmationText, /青春源汰淨 1 組｜規則：1盒一組｜本次 1 盒/);
assert.match(general.confirmationText, /極光白賦美 EX 1 組｜規則：5盒一組｜本次 5 盒/);

const mix = expectOk(
  parseRedemptionMessage(
    `
7/2
任搭4
衛樂寧 1盒
多采 1盒
B群 2盒
`,
    yiNingPackagePlan,
    { defaultYear: 2026 },
  ),
);

assert.equal(mix.date, "2026-07-02");
assert.equal(mix.creditUsed, 1);
assert.equal(mix.totalBoxes, 4);
assert.equal(mix.mixGroups.length, 1);

const combined = expectOk(
  parseRedemptionMessage(
    `
7/3
D 1組
任搭4
衛樂寧 2盒
多采 2盒
`,
    yiNingPackagePlan,
    { defaultYear: 2026 },
  ),
);

assert.equal(combined.creditUsed, 2);
assert.equal(combined.totalBoxes, 5);
assert.equal(combined.generalItems.length, 1);
assert.equal(combined.mixGroups.length, 1);

const invalidMix = parseRedemptionMessage(
  `
7/4
任搭4
衛樂寧 1盒
多采 1盒
`,
  yiNingPackagePlan,
  { defaultYear: 2026 },
);

assert.equal(invalidMix.ok, false);
assert.match(invalidMix.errors.join("\n"), /需要剛好 4 盒，目前是 2 盒/);

console.log("Redemption parser OK");
console.log(general.confirmationText);
