/**
 * Copies MapLibre GL's worker bundle into public/ so the browser can load it.
 *
 * MapLibre 6 splits its background worker across two files that must sit next
 * to each other: the worker entry imports its sibling with a relative path.
 * Webpack's documented `new URL(..., import.meta.url)` approach only emits one
 * of the two, so the worker dies on its first line and no tile ever renders
 * (silently, with a clean build and an empty console). Copying both files to
 * the site root instead keeps them together.
 *
 * next.config.ts calls this on every Next.js start, so it cannot drift from
 * the installed version and cannot be skipped by building with `next build`
 * directly instead of `npm run build`. src/components/ui/map.tsx points
 * MapLibre at the copy via setWorkerUrl("/maplibre-gl-worker.mjs").
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Both files are required: the worker entry and the shared chunk it imports.
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

export function copyMaplibreWorker() {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sourceDir = join(projectRoot, "node_modules", "maplibre-gl", "dist");
  const targetDir = join(projectRoot, "public");

  mkdirSync(targetDir, { recursive: true });

  const copied = [];

  for (const file of FILES) {
    const source = join(sourceDir, file);
    if (!existsSync(source)) {
      throw new Error(
        `[copy-maplibre-worker] Missing ${source}. Run npm install, or check whether maplibre-gl changed its dist layout.`,
      );
    }

    // The source only changes on npm install, so skip the copy when the
    // destination already matches. Saves rewriting ~530KB on every start.
    const target = join(targetDir, file);
    const sourceStat = statSync(source);
    if (existsSync(target)) {
      const targetStat = statSync(target);
      if (targetStat.size === sourceStat.size && targetStat.mtimeMs >= sourceStat.mtimeMs) {
        continue;
      }
    }

    copyFileSync(source, target);
    copied.push(file);
  }

  return copied;
}

// Allow running this directly: `node scripts/copy-maplibre-worker.mjs`
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    const copied = copyMaplibreWorker();
    console.log(
      copied.length
        ? `[copy-maplibre-worker] Copied ${copied.join(", ")} to public/`
        : "[copy-maplibre-worker] public/ already up to date",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
