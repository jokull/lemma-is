#!/usr/bin/env node
/**
 * Build and evaluate multiple compact binaries to find size/accuracy tradeoffs.
 *
 * Usage:
 *   node --import=tsx scripts/benchmark/core-sweep.ts
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { statSync } from "node:fs";

type SweepConfig = {
  label: string;
  topWords?: number;
  minFreq?: number;
};

const projectRoot = process.cwd();
const buildScript = join(projectRoot, "scripts", "build-binary.py");
const evalScript = join(projectRoot, "scripts", "benchmark", "core-eval.ts");
const memoryScript = join(projectRoot, "scripts", "benchmark", "memory-js.ts");

const configs: SweepConfig[] = [
  { label: "top_100k", topWords: 100_000 },
  { label: "top_200k", topWords: 200_000 },
  { label: "top_500k", topWords: 500_000 },
  { label: "top_1m", topWords: 1_000_000 },
  { label: "min_50", minFreq: 50 },
  { label: "min_100", minFreq: 100 },
];

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): string {
  const result = spawnSync(cmd, args, {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${cmd} ${args.join(" ")}\n${result.stderr}`
    );
  }
  return result.stdout.trim();
}

function buildBinary(config: SweepConfig, outputPath: string) {
  const args = [buildScript, "--output", outputPath, "--no-bigrams", "--no-morph"];
  if (config.topWords) {
    args.push("--top-words", String(config.topWords));
  }
  if (config.minFreq) {
    args.push("--min-freq", String(config.minFreq));
  }
  run("python", args);
}

function evalBinary(candidatePath: string) {
  const output = run("node", [
    "--import=tsx",
    evalScript,
    "--candidate",
    candidatePath,
  ]);
  return JSON.parse(output);
}

function memoryBinary(candidatePath: string) {
  const output = run(
    "node",
    ["--expose-gc", "--import=tsx", memoryScript],
    { LEMMA_IS_DATA: candidatePath }
  );
  return JSON.parse(output);
}

const results: Record<string, unknown> = {};

for (const config of configs) {
  const outputPath = join(
    projectRoot,
    "data-dist",
    `lemma-is.core.${config.label}.bin`
  );
  console.log(`\n=== Building ${config.label} ===`);
  buildBinary(config, outputPath);

  const sizeMB = statSync(outputPath).size / (1024 * 1024);
  console.log(`  File size: ${sizeMB.toFixed(2)} MB`);

  console.log(`  Measuring memory...`);
  const mem = memoryBinary(outputPath);

  console.log(`  Evaluating accuracy/coverage...`);
  const evalRes = evalBinary(outputPath);

  results[config.label] = {
    config,
    fileSizeMB: Math.round(sizeMB * 10) / 10,
    memory: mem,
    evaluation: evalRes,
  };
}

console.log(JSON.stringify(results, null, 2));
