"""Framework adapters. Each imports its framework only when called, so donecheck itself stays dependency-free.

    from donecheck.integrations import langchain_tool, openai_agents_tool
"""
from typing import List, Optional

from . import NEXT, TOOL, done_check, summary


def _run(task, result, must_include, client):
    try:
        v = done_check(task, result, must_include or [], client=client)
    except (TypeError, ValueError) as e:
        return "Input error: %s. Fix the arguments and call done_check again." % e
    return "%s\n%s" % (summary(v), NEXT[v["verdict"]])


def check_for_model(task: str, result: str, must_include: Optional[List[str]] = None) -> str:
    """Plain function for any tool-calling loop: returns the line to send back as the tool result."""
    return _run(task, result, must_include, "py-loop")


def langchain_tool():
    """A LangChain StructuredTool named done_check (langchain-core >= 0.2). Works with LangGraph's create_react_agent."""
    from langchain_core.tools import StructuredTool

    def done_check_tool(task: str, result: str, mustInclude: Optional[List[str]] = None) -> str:
        return _run(task, result, mustInclude, "langchain")

    return StructuredTool.from_function(func=done_check_tool, name=TOOL["name"], description=TOOL["description"])


def openai_agents_tool():
    """A tool for the OpenAI Agents SDK (pip install openai-agents)."""
    from agents import function_tool

    def done_check(task: str, result: str, must_include: Optional[List[str]] = None) -> str:  # noqa: F811
        """Call this BEFORE telling the user a task is finished. Returns SUBMIT (finish), FIX (redo using the reason) or HOLD (ask the user).

        Args:
            task: What the user asked for.
            result: What you produced. Task + result at most 2,000 characters.
            must_include: Optional strings the result must contain (up to 5).
        """
        return _run(task, result, must_include, "openai-agents")

    return function_tool(done_check)
