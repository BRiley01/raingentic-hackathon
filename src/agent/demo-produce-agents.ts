import { produceFixedAgentOutput } from "./orchestrator.js";

async function main() {
  const out = await produceFixedAgentOutput();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
