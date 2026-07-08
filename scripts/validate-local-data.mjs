import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function extractSlugsFromProducts(source) {
  return [...source.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function extractAliasTargets(source) {
  return [...source.matchAll(/:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function extractProductSlugsFromPlan(source) {
  const matches = [...source.matchAll(/productSlugs:\s*\[([\s\S]*?)\]/g)];
  return matches.flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((slugMatch) => slugMatch[1]));
}

function extractImagePaths(source) {
  return [...source.matchAll(/imageSrc:\s*"([^"]+)"/g)].map((match) => match[1]);
}

const productSource = read("src/data/products.ts");
const aliasSource = read("src/data/productAliases.ts");
const planSource = read("src/data/students/yi-ning.ts");

const productSlugs = extractSlugsFromProducts(productSource);
const productSlugSet = new Set(productSlugs);
const aliasTargets = extractAliasTargets(aliasSource);
const planProductSlugs = extractProductSlugsFromPlan(planSource);
const imagePaths = extractImagePaths(productSource);

const errors = [];

if (productSlugs.length !== productSlugSet.size) {
  errors.push("Duplicate product slugs found.");
}

for (const target of aliasTargets) {
  if (!productSlugSet.has(target)) {
    errors.push(`Alias target does not exist in products: ${target}`);
  }
}

for (const slug of planProductSlugs) {
  if (!productSlugSet.has(slug)) {
    errors.push(`Plan product slug does not exist in products: ${slug}`);
  }
}

for (const imagePath of imagePaths) {
  const relativeFile = imagePath.replace(/^\//, "");
  if (!fs.existsSync(path.join(root, "public", relativeFile.replace(/^products\//, "products/")))) {
    errors.push(`Product image file is missing: ${imagePath}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Local data OK: ${productSlugs.length} products, ${aliasTargets.length} aliases, ${planProductSlugs.length} rule product refs.`);
