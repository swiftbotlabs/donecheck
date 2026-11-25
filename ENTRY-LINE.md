Proposed addition for the H2 entry (.next2) at the 11-28 filing prep. Only use it after task 1125-0840 is DONE (public repo live, smoke PASS). It changes the entry text, so verify must run again.
Put it under the integration / adoption part, replacing nothing:

"Drop-in for other developers: `claude mcp add done-check -- npx -y github:swiftbotlabs/donecheck mcp` adds the check to any MCP client; the same package is a CLI gate (exit 0 only on SUBMIT), a Python client and adapters for the Vercel AI SDK, LangChain and the OpenAI Agents SDK, with no dependencies. Public usage by integration: donecheck.swiftbotlab.workers.dev/api/stats."

If /api/stats shows outside checks by then, add the real counts (and say that they include our own smoke runs).
