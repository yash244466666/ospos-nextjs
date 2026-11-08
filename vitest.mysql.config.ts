import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "next/server": path.resolve(__dirname, "node_modules/next/server.js"),
      "next/headers": path.resolve(__dirname, "node_modules/next/headers.js"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.mysql.test.ts"],
    setupFiles: ["./vitest.mysql.setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      DB_DRIVER: "mysql",
      DATABASE_URL:
        process.env.TEST_MYSQL_URL ?? "mysql://root:root@127.0.0.1:3307/ospos_test",
    },
  },
});
