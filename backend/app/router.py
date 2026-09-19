"""Model selection and dynamic routing.

The router never chooses a provider — it chooses capabilities. Callers ask
for `reasoning`, `coding`, `cheap`, etc.; select_models() ranks whatever is
in the registry against that ask. Adding a provider is a config.py change;
this file and the API never mention "Claude" or "GPT" by name.

Three jobs:
  1. select_models(criteria)  -> which model(s) fit, best-first, optionally
                                  nudged by this project's decision history
  2. route_and_complete(...)  -> execute SINGLE / PARALLEL / DELIBERATION
  3. the deliberation pipeline -> parallel answers, a critique round where
                                  each model sees the others' answers, then
                                  one synthesized result
"""
import asyncio
import time

import litellm

from app.config import ModelSpec, RoutingMode, Settings, MODEL_REGISTRY, get_settings
from app.schemas import ChatMessage, ModelResponse, RoutingCriteria

litellm.drop_params = True  # ignore provider-unsupported params instead of raising

# How much one historically-accepted decision shifts a model's score, and the
# cap on how many past decisions count — enough to break ties, not enough to
# let a hot streak override an outright capability mismatch.
AFFINITY_WEIGHT = 0.5
AFFINITY_CAP = 10


def _provider_key(settings: Settings, provider: str) -> str | None:
    return {
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "gemini": settings.gemini_api_key,
    }.get(provider) or None


def _score(model: ModelSpec, criteria: RoutingCriteria, affinity: dict[str, int] | None) -> float:
    """Lower is better. Disqualified candidates return -inf and get filtered out."""
    if not model.is_active:
        return float("-inf")
    if criteria.min_context_window and model.context_window < criteria.min_context_window:
        return float("-inf")
    if criteria.max_cost_per_1k_output and model.cost_per_1k_output > criteria.max_cost_per_1k_output:
        return float("-inf")
    if criteria.required_capabilities and not set(criteria.required_capabilities).issubset(set(model.capabilities)):
        return float("-inf")

    score = model.cost_per_1k_output * 10
    score += model.speed_tier * (2 if criteria.prefer_speed else 0.5)

    if affinity:
        accepted = min(affinity.get(model.id, 0), AFFINITY_CAP)
        score -= accepted * AFFINITY_WEIGHT  # this project has liked this model before — rank it higher
    return score


def _dedupe_by_provider(ranked: list[ModelSpec]) -> list[ModelSpec]:
    """PARALLEL/DELIBERATION want one perspective per provider, not three
    flavors of the same underlying model."""
    seen: set[str] = set()
    out: list[ModelSpec] = []
    for m in ranked:
        if m.provider in seen:
            continue
        seen.add(m.provider)
        out.append(m)
    return out


def select_models(
    criteria: RoutingCriteria,
    registry: list[ModelSpec] = MODEL_REGISTRY,
    affinity: dict[str, int] | None = None,
) -> list[ModelSpec]:
    """Return candidates ordered best-first. For SINGLE, the rest of the list
    is the fallback chain; for PARALLEL/DELIBERATION it's the fan-out set."""
    if criteria.explicit_models:
        chosen = [m for m in registry if m.id in criteria.explicit_models]
        if chosen:
            return chosen

    scored = {m.id: _score(m, criteria, affinity) for m in registry}
    ranked = sorted(
        (m for m in registry if scored[m.id] != float("-inf")),
        key=lambda m: scored[m.id],
    )
    if not ranked:
        raise ValueError("No model in the registry satisfies the given routing criteria")

    if criteria.mode in (RoutingMode.PARALLEL, RoutingMode.DELIBERATION):
        ranked = _dedupe_by_provider(ranked)[: criteria.max_parallel]
    return ranked


async def _call_model(
    model: ModelSpec,
    messages: list[ChatMessage],
    settings: Settings,
    phase: str = "initial",
) -> ModelResponse:
    start = time.perf_counter()
    api_key = _provider_key(settings, model.provider)
    kwargs = {
        "model": model.id,
        "messages": [m.model_dump() for m in messages],
        "api_key": api_key,
    }
    if model.provider == "anthropic" and settings.anthropic_workspace_id:
        kwargs["extra_headers"] = {"anthropic-workspace-id": settings.anthropic_workspace_id}
    try:
        result = None
        for attempt in range(2):
            try:
                result = await litellm.acompletion(**kwargs)
                break
            except Exception as exc:
                transient = any(marker in str(exc) for marker in (" 429", " 503", "rate_limit", "UNAVAILABLE", "temporarily"))
                if attempt == 0 and transient:
                    await asyncio.sleep(0.8)
                    continue
                raise
        if result is None:
            raise RuntimeError("Model returned no result")
        latency_ms = int((time.perf_counter() - start) * 1000)
        usage = result.usage
        tokens_in = getattr(usage, "prompt_tokens", 0) or 0
        tokens_out = getattr(usage, "completion_tokens", 0) or 0
        cost = (tokens_in / 1000) * model.cost_per_1k_input + (tokens_out / 1000) * model.cost_per_1k_output
        return ModelResponse(
            model_id=model.id,
            provider=model.provider,
            display_name=model.display_name,
            phase=phase,
            content=result.choices[0].message.content,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=round(cost, 6),
            latency_ms=latency_ms,
            success=True,
        )
    except Exception as exc:  # noqa: BLE001 — surfaced to caller as a failed ModelResponse, not raised
        latency_ms = int((time.perf_counter() - start) * 1000)
        return ModelResponse(
            model_id=model.id,
            provider=model.provider,
            display_name=model.display_name,
            phase=phase,
            success=False,
            error=str(exc),
            latency_ms=latency_ms,
        )


def _peer_answers_block(responses: list[ModelResponse], exclude_model_id: str | None = None) -> str:
    parts = [
        f"### {r.display_name}\n{r.content}"
        for r in responses
        if r.success and r.model_id != exclude_model_id
    ]
    return "\n\n".join(parts)


async def _run_critique_round(
    initial: list[ModelResponse],
    candidates: list[ModelSpec],
    messages: list[ChatMessage],
    settings: Settings,
) -> list[ModelResponse]:
    """Each model that answered sees the others' answers and is asked to
    challenge, defend, or revise its own — the "models inspect other models'
    responses" step."""
    successful = [r for r in initial if r.success]
    if len(successful) < 2:
        return []

    by_id = {m.id: m for m in candidates}
    tasks = []
    for r in successful:
        model = by_id.get(r.model_id)
        if not model:
            continue
        peers = _peer_answers_block(successful, exclude_model_id=r.model_id)
        critique_messages = [
            *messages,
            ChatMessage(role="assistant", content=r.content or ""),
            ChatMessage(
                role="user",
                content=(
                    "Other models independently answered the same question:\n\n"
                    f"{peers}\n\n"
                    "Reconsider your answer in light of theirs. Where you disagree, say so and why. "
                    "Where they raise something you missed, incorporate it. Give your revised answer."
                ),
            ),
        ]
        tasks.append(_call_model(model, critique_messages, settings, phase="critique"))
    return list(await asyncio.gather(*tasks)) if tasks else []


async def _run_synthesis(
    initial: list[ModelResponse],
    critiques: list[ModelResponse],
    candidates: list[ModelSpec],
    messages: list[ChatMessage],
    settings: Settings,
    synthesizer_model_id: str | None,
) -> ModelResponse | None:
    """One model produces the final, reconciled answer from every perspective."""
    pool = critiques or initial
    successful = [r for r in pool if r.success]
    if not successful:
        return None

    synthesizer = next((m for m in candidates if m.id == synthesizer_model_id), None) or candidates[0]
    peers = _peer_answers_block(successful)
    synthesis_messages = [
        *messages,
        ChatMessage(
            role="user",
            content=(
                "Several models answered this question, then revised their answers after seeing "
                "each other's reasoning:\n\n"
                f"{peers}\n\n"
                "Produce one synthesized answer: state where they agreed, resolve where they "
                "disagreed (and say how you resolved it), and give the final recommendation."
            ),
        ),
    ]
    return await _call_model(synthesizer, synthesis_messages, settings, phase="synthesis")


async def route_and_complete(
    messages: list[ChatMessage],
    criteria: RoutingCriteria,
    settings: Settings | None = None,
    affinity: dict[str, int] | None = None,
) -> tuple[list[ModelResponse], str | None, ModelResponse | None]:
    """Returns (responses, chosen_model_id, synthesis).
    - SINGLE: responses is the fallback trail (usually length 1); chosen_model_id
      is the one that succeeded, or None if every candidate failed.
    - PARALLEL: every candidate's response, chosen_model_id is None (the human
      or a later decision picks a winner via PerspectiveGrid).
    - DELIBERATION: initial + critique responses, plus a synthesis result.
    """
    settings = settings or get_settings()
    candidates = select_models(criteria, affinity=affinity)

    if criteria.mode == RoutingMode.PARALLEL:
        responses = await asyncio.gather(*(_call_model(m, messages, settings) for m in candidates))
        return list(responses), None, None

    if criteria.mode == RoutingMode.DELIBERATION:
        initial = list(await asyncio.gather(*(_call_model(m, messages, settings) for m in candidates)))
        critiques = await _run_critique_round(initial, candidates, messages, settings)
        synthesis = await _run_synthesis(
            initial, critiques, candidates, messages, settings, criteria.synthesizer_model
        )
        return initial + critiques, None, synthesis

    # SINGLE — walk the ranked list until one call succeeds
    attempts: list[ModelResponse] = []
    for model in candidates:
        resp = await _call_model(model, messages, settings)
        attempts.append(resp)
        if resp.success:
            return attempts, resp.model_id, None
    return attempts, None, None
