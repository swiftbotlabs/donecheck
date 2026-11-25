// An agent that may only finish on SUBMIT. npm i ai zod @ai-sdk/anthropic donecheck@github:swiftbotlabs/donecheck
// ANTHROPIC_API_KEY=... node examples/vercel-ai-sdk.mjs
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { aiSdkDoneCheck } from "donecheck/ai-sdk";

const { text, steps } = await generateText({
  model: anthropic(process.env.MODEL || "claude-sonnet-5-5"),
  tools: { done_check: aiSdkDoneCheck({ tool, z }) },
  stopWhen: stepCountIs(6),
  system: "Never tell the user a task is done without a SUBMIT from done_check. On FIX, redo it and check again. On HOLD, show your result and say the check was unclear.",
  prompt: "Write a one-line JavaScript expression that is true when the string s has at least 12 characters.",
});
for (const s of steps) for (const r of s.toolResults ?? []) console.error("done_check ->", r.output?.summary ?? r.output);
console.log(text);
