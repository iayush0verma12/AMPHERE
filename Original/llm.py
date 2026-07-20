"""
llm.py
------
One tiny interface, four providers:

    mock      -> zero-dependency deterministic reasoner. Runs with NO setup.
    ollama    -> local model (Qwen2.5) via HTTP. Free, on the GPU laptop.
    anthropic -> Claude API (demo insurance).
    openai    -> OpenAI API.

Every provider exposes  .complete(system, prompt) -> str .
Switch with the LLM_PROVIDER env var (see config.py). The orchestrator is
identical across providers because it only ever asks for plain text / JSON.
"""
from __future__ import annotations
import json
import re

from config import (LLM_PROVIDER, LLM_MODEL, OLLAMA_HOST,
                    ANTHROPIC_API_KEY, OPENAI_API_KEY)


class BaseLLM:
    name = "base"
    def complete(self, system: str, prompt: str) -> str:
        raise NotImplementedError


# ---------------------------------------------------------------- MOCK
class MockLLM(BaseLLM):
    """
    Deterministic stand-in so the whole product runs with zero setup.
    It reads the 'TOOLS ALREADY CALLED' line the orchestrator puts in the prompt
    and returns the next action in the canonical order, then a final decision.
    The final explanation is templated from the real tool outputs embedded in
    the prompt — so it reflects genuine numbers, not canned text.
    """
    name = "mock"
    ORDER = ["predict_health", "estimate_rul", "plan_charging",
             "schedule_maintenance", "compute_carbon"]

    def complete(self, system: str, prompt: str) -> str:
        called = re.search(r"TOOLS ALREADY CALLED:\s*\[(.*?)\]", prompt)
        done = [c.strip().strip("'\"") for c in
                (called.group(1).split(",") if called and called.group(1).strip() else [])]
        for tool in self.ORDER:
            if tool not in done:
                thought = {
                    "predict_health": "Check current state-of-health first.",
                    "estimate_rul": "Estimate remaining useful life and confidence.",
                    "plan_charging": "Resolve the charge-speed vs battery-life trade-off.",
                    "schedule_maintenance": "Slot the at-risk asset into the workshop.",
                    "compute_carbon": "Quantify the carbon impact.",
                }[tool]
                return json.dumps({"type": "call", "tool": tool,
                                   "args": {}, "thought": thought})
        # all tools done -> final decision, narrated from the prompt's numbers
        return json.dumps({"type": "final",
                           "explanation": _mock_narrative(prompt)})


def _mock_narrative(prompt: str) -> str:
    def grab(key, default="?"):
        m = re.search(rf"{key}\s*=\s*([^\n,;]+)", prompt)
        return m.group(1).strip() if m else default
    strat = grab("chosen_strategy")
    rul = grab("rul_cycles")
    saved = grab("cycles_saved_per_yr")
    return (
        f"This asset has ~{rul} cycles of life left. Fast-charging would make "
        f"tomorrow's shift but burns battery life unnecessarily. I recommend the "
        f"'{strat}' charging strategy: it still meets the shift while preserving "
        f"about {saved} cycles of pack life per year, and I've scheduled the "
        f"asset for maintenance before its risk window. Net: availability held, "
        f"battery cost minimised, emissions reduced."
    )


# ---------------------------------------------------------------- OLLAMA
class OllamaLLM(BaseLLM):
    name = "ollama"
    def complete(self, system: str, prompt: str) -> str:
        import requests
        r = requests.post(f"{OLLAMA_HOST}/api/chat", json={
            "model": LLM_MODEL,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": prompt}],
            "stream": False,
            "options": {"temperature": 0.2},
        }, timeout=300)
        r.raise_for_status()
        return r.json()["message"]["content"]


# ---------------------------------------------------------------- ANTHROPIC
class AnthropicLLM(BaseLLM):
    name = "anthropic"
    def complete(self, system: str, prompt: str) -> str:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=LLM_MODEL if "claude" in LLM_MODEL else "claude-sonnet-4-6",
            max_tokens=1000, system=system,
            messages=[{"role": "user", "content": prompt}])
        return "".join(b.text for b in msg.content if b.type == "text")


# ---------------------------------------------------------------- OPENAI
class OpenAILLM(BaseLLM):
    name = "openai"
    def complete(self, system: str, prompt: str) -> str:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=LLM_MODEL if "gpt" in LLM_MODEL else "gpt-4o-mini",
            temperature=0.2,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": prompt}])
        return resp.choices[0].message.content


_PROVIDERS = {"mock": MockLLM, "ollama": OllamaLLM,
              "anthropic": AnthropicLLM, "openai": OpenAILLM}


def get_llm(provider: str | None = None) -> BaseLLM:
    p = (provider or LLM_PROVIDER).lower()
    if p not in _PROVIDERS:
        raise ValueError(f"Unknown LLM_PROVIDER '{p}'. "
                         f"Choose from {list(_PROVIDERS)}")
    return _PROVIDERS[p]()


if __name__ == "__main__":
    llm = get_llm()
    print("Provider:", llm.name)
    print(llm.complete("You are a test.", "TOOLS ALREADY CALLED: []"))
