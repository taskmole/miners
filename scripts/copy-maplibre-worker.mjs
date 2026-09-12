/**
 * Copies MapLibre GL's worker bundle into public/ so the browser can load it.
 *
 * MapLibre 6 splits its background worker across two files that must sit next
 * to each other: the worker entry imports its sibling with a relative path.
 * Webpack's documented `new URL(..., import.meta.url)` approach only emits one
 * of the two, so the worker dies on its first line and no tile ever renders
 * (silently, with a clean build and an empty console). Copying both files to
 * the site root instead keeps them together and keeps them in lockstep with
 * whatever version is installed, because this runs on every dev start and
 * every build (see the predev/prebuild scripts in package.json).
 *
 * src/components/ui/map.tsx points MapLibre at the copied worker via
 * setWorkerUrl("/maplibre-gl-worker.mjs").
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(projectRoot, "node_modules", "maplibre-gl", "dist");
const targetDir = join(projectRoot, "public");

// Both files are required: the worker entry and the shared chunk it imports.
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const source = join(sourceDir, file);
  if (!existsSync(source)) {
    console.error(
      `[copy-maplibre-worker] Missing ${source}. Run npm install, or check whether maplibre-gl changed its dist layout.`,
    );
    process.exit(1);
  }
  copyFileSync(source, join(targetDir, file));
}

console.log(`[copy-maplibre-worker] Copied ${files.join(", ")} to public/`);
