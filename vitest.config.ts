import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test files share one on-disk marketplace (data/agents.json), and the rating
    // tests write to it. Running files in parallel means one file's writes land
    // underneath another file's reads — which showed up as unrelated query tests
    // failing with `undefined`. Writes are atomic now, but the VALUES still move, so
    // serialise the files rather than pretend shared mutable state is safe.
    fileParallelism: false,
  },
});
