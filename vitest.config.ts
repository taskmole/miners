import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    // tsconfig.json sets jsx: "preserve", which Next needs and which leaves
    // the test transformer unable to parse a .tsx file at all. The email
    // tests render real templates, so they need it compiled. Overridden here
    // rather than in tsconfig, so only the tests are affected.
    oxc: { jsx: { runtime: "automatic" } },
    test: {
        environment: "jsdom",
        globals: true,
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        exclude: ["tests/**", ".claude/**", "node_modules/**"],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
