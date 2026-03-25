#!/usr/bin/env node
// Generate PWA icons from favicon.svg
import sharp from "sharp";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const svgSource = readFileSync(join(publicDir, "favicon.svg"));

const BG_COLOR = { r: 15, g: 23, b: 42, alpha: 1 }; // #0f172a

const sizes = [
  { name: "icon-192.png", size: 192, padding: 24 },
  { name: "icon-512.png", size: 512, padding: 64 },
  { name: "apple-touch-icon.png", size: 180, padding: 22 },
];

for (const { name, size, padding } of sizes) {
  const iconSize = size - padding * 2;

  // Render SVG at icon size
  const icon = await sharp(svgSource)
    .resize(iconSize, iconSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Composite onto colored background
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG_COLOR },
  })
    .composite([{ input: icon, gravity: "center" }])
    .png()
    .toFile(join(publicDir, name));

  console.log(`Generated ${name} (${size}x${size})`);
}
