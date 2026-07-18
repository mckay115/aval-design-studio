import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const siteRoot = resolve(repositoryRoot, "site");
const requiredFiles = ["index.html", "styles.css", "downloads.js", "downloads.json"];

await Promise.all(requiredFiles.map((file) => access(resolve(siteRoot, file))));

const indexHtml = await readFile(resolve(siteRoot, "index.html"), "utf8");

if (!indexHtml.includes('href="https://www.zachlisko.com/projects/"')) {
  throw new Error("The AVAL landing page must link back to the portfolio projects page.");
}

for (const match of indexHtml.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const reference = match[1];
  if (/^(?:https?:|mailto:|#)/.test(reference)) continue;
  await access(resolve(siteRoot, reference));
}

console.log(`Validated ${requiredFiles.length} required Pages files and local landing-page references.`);
