"""A LangGraph agent that may only finish on SUBMIT.
pip install "donecheck @ git+https://github.com/swiftbotlabs/donecheck#subdirectory=python" langgraph langchain-anthropic
ANTHROPIC_API_KEY=... python examples/langchain_agent.py
"""
import os

from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

from donecheck.integrations import langchain_tool

agent = create_react_agent(
    ChatAnthropic(model=os.environ.get("MODEL", "claude-sonnet-5-5")),
    tools=[langchain_tool()],
    prompt="Never tell the user a task is done without a SUBMIT from done_check. On FIX, redo it and check again. "
    "On HOLD, show your result and say the check was unclear.",
)
out = agent.invoke({"messages": [("user", "Write a Python one-liner that returns the 3 largest unique numbers in list xs, largest first.")]})
for m in out["messages"]:
    if m.type == "tool":
        print("done_check ->", m.content.splitlines()[0])
print(out["messages"][-1].content)
