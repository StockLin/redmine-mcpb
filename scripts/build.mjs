// Bundle the server and its dependencies into server/ so the .mcpb needs no node_modules.
import { build } from "esbuild";
import { mkdir, readFile, rm } from "node:fs/promises";

const { version } = JSON.parse(await readFile("manifest.json", "utf8"));

await rm("server", { recursive: true, force: true });
await mkdir("server");

await build({
  entryPoints: ["src/index.ts"],
  outfile: "server/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: true,
  legalComments: "external",
  define: { __VERSION__: JSON.stringify(version) },
  // Some bundled deps are CommonJS and call require() at runtime.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});

console.log(`built server/index.mjs (v${version})`);
