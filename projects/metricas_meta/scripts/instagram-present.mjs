import { buildBriefing } from '../src/briefing.mjs';
import { loadConfig, loadEnvFile } from '../src/config.mjs';
import { createMetaClient } from '../src/meta-client.mjs';
import { runPipeline, persistBriefing } from '../src/pipeline.mjs';
import { createPresentonClient } from '../src/presenton-client.mjs';
import { getWindow } from '../src/windows.mjs';
import { redactText } from '../src/redact.mjs';
import { fileURLToPath } from 'node:url';

function parseArgs(args) {
  if (args.length !== 2 || args[0] !== '--window' || !['weekly', 'monthly'].includes(args[1])) {
    throw new Error('Usage: --window weekly|monthly');
  }
  return args[1];
}

export const sanitize = redactText;

export async function main(args = process.argv.slice(2), env = process.env) {
  const kind = parseArgs(args);
  loadEnvFile(env);
  const config = loadConfig(env);
  const window = getWindow(kind);
  const metaClient = createMetaClient({
    accessToken: config.metaAccessToken,
    graphVersion: config.metaGraphApiVersion,
  });
  const presentonClient = createPresentonClient({
    baseUrl: config.presentonBaseUrl,
    apiKey: config.presentonApiKey,
    timeoutMs: config.presentonTimeoutMs,
  });
  const result = await runPipeline({
    metaClient,
    presentonClient,
    config,
    window,
    buildBriefing,
    persistBriefing,
  });
  const warnings = result.briefing?.json?.warnings ?? result.snapshot.warnings ?? [];
  console.log(`run_id: ${result.runId}`);
  console.log(`window: ${kind}`);
  console.log(`snapshot: ${result.snapshotPath}`);
  console.log(`briefing_json: ${result.briefingPaths?.json ?? 'not persisted'}`);
  console.log(`briefing_markdown: ${result.briefingPaths?.markdown ?? 'not persisted'}`);
  console.log(`presentation: ${result.presentation?.outputPath ?? result.presentation?.fileUrl ?? 'not generated'}`);
  for (const warning of warnings) console.log(`warning: ${sanitize(warning, config.metaAccessToken)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`Error: ${sanitize(error?.message ?? error)}`);
    process.exitCode = 1;
  });
}
