// Vercel AI SDK (ai v5+) adapter. Pass in your own `tool` and `z` so donecheck stays dependency-free:
//   import { tool } from "ai"; import { z } from "zod"; import { aiSdkDoneCheck } from "donecheck/ai-sdk";
//   const tools = { done_check: aiSdkDoneCheck({ tool, z }) };
import { doneCheck, summary, NEXT, TOOL } from "../index.mjs";

export function aiSdkDoneCheck({ tool, z }, opts = {}) {
  if (typeof tool !== "function" || !z?.object) throw new TypeError("pass { tool } from 'ai' and { z } from 'zod'");
  return tool({
    description: TOOL.description,
    inputSchema: z.object({
      task: z.string().describe(TOOL.inputSchema.properties.task.description),
      result: z.string().describe(TOOL.inputSchema.properties.result.description),
      mustInclude: z.array(z.string()).max(5).optional().describe(TOOL.inputSchema.properties.mustInclude.description),
    }),
    execute: async ({ task, result, mustInclude = [] }) => {
      try {
        const v = await doneCheck({ task, result, mustInclude }, { client: "ai-sdk", ...opts });
        return { verdict: v.verdict, next: NEXT[v.verdict], summary: summary(v), receipt: v.receipt?.receipt_hash ?? null };
      } catch (e) { return { verdict: "HOLD", next: `Input error: ${e.message}. Fix the arguments and call done_check again.`, summary: "", receipt: null }; }
    },
  });
}
