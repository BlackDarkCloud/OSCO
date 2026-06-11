const fs = require("fs");
const path = require("path");

const root = process.cwd();
const dist = path.join(root, "dist");
const files = ["index.html", "styles.css", "app.js", "config.js"];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "assets"), { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}

for (const asset of fs.readdirSync(path.join(root, "assets"))) {
  fs.copyFileSync(path.join(root, "assets", asset), path.join(dist, "assets", asset));
}

console.log("Built OSCO site into dist/");
