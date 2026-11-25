"""OpenAI Agents SDK: an agent that may only finish on SUBMIT.
pip install "donecheck @ git+https://github.com/swiftbotlabs/donecheck#subdirectory=python" openai-agents
OPENAI_API_KEY=... python examples/openai_agents.py
"""
from agents import Agent, Runner

from donecheck.integrations import openai_agents_tool

agent = Agent(
    name="careful",
    instructions="Never tell the user a task is done without a SUBMIT from done_check. On FIX, redo it and check again. "
    "On HOLD, show your result and say the check was unclear.",
    tools=[openai_agents_tool()],
)
print(Runner.run_sync(agent, "Write a SQL query that returns each customer's total order amount, highest first.").final_output)
