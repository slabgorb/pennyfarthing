"""OTLP receiver — port of packages/core/src/server/otlp-receiver.ts.

Parses OpenTelemetry HTTP/JSON payloads (logs, metrics, traces) and
aggregates token usage statistics. Stateless parse functions + stateful
OTLPReceiver class for accumulation.


Story 48-1: Initial skeleton.
Story 148-5: Trace parsing, span storage, log-to-span conversion.
"""

from __future__ import annotations

from typing import Any

MAX_SPANS = 500


def _extract_attr(attrs: list[dict[str, Any]], key: str) -> Any:
    """Extract a typed value from an OTLP attributes list."""
    for attr in attrs:
        if attr.get("key") == key:
            val = attr.get("value") or {}
            if "stringValue" in val:
                return val["stringValue"]
            if "boolValue" in val:
                return val["boolValue"]
            if "intValue" in val:
                return val["intValue"]
    return None


def _coerce_bool(value: Any) -> bool | None:
    """Coerce a value to bool, handling string 'true'/'false'."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == "true"
    return None


def parse_otlp_metrics(body: dict[str, Any]) -> dict[str, int | float]:
    """Extract token counts and cost from OTLP metrics payload.

    Processes metrics named 'claude_code.token.usage' (tokens, keyed by the
    ``type`` attribute) and 'claude_code.cost.usage' (cost in USD).
    Returns dict with keys: inputTokens, outputTokens, cacheReadTokens,
    cacheCreationTokens, totalCost.
    """
    result: dict[str, int | float] = {}
    resource_metrics = body.get("resourceMetrics")
    if not resource_metrics:
        return result

    for rm in resource_metrics:
        for sm in rm.get("scopeMetrics") or []:
            for metric in sm.get("metrics") or []:
                name = metric.get("name")
                if name == "claude_code.cost.usage":
                    sum_field = metric.get("sum")
                    if not sum_field:
                        continue
                    for dp in sum_field.get("dataPoints") or []:
                        # Cost is emitted in USD as a double; fall back to asInt
                        # for exporters that round whole-dollar values.
                        cost = dp.get("asDouble")
                        if cost is None:
                            cost = dp.get("asInt")
                        if cost is not None:
                            result["totalCost"] = float(cost)
                    continue
                if name != "claude_code.token.usage":
                    continue
                sum_field = metric.get("sum")
                if not sum_field:
                    continue
                for dp in sum_field.get("dataPoints") or []:
                    attrs = dp.get("attributes") or []
                    type_attr = next((a for a in attrs if a.get("key") == "type"), None)
                    if not type_attr:
                        continue
                    token_type = (type_attr.get("value") or {}).get("stringValue")
                    value = dp.get("asInt", 0)
                    if token_type == "input":
                        result["inputTokens"] = value
                    elif token_type == "output":
                        result["outputTokens"] = value
                    elif token_type == "cacheRead":
                        result["cacheReadTokens"] = value
                    elif token_type == "cacheCreation":
                        result["cacheCreationTokens"] = value
    return result


def parse_otlp_logs(
    body: dict[str, Any],
) -> list[dict[str, Any]]:
    """Parse OTLP log records into structured events.

    Converts nanosecond timestamps to milliseconds.
    Extracts string, int, and bool attribute values.
    """
    events: list[dict[str, Any]] = []
    resource_logs = body.get("resourceLogs")
    if not resource_logs:
        return events

    for rl in resource_logs:
        for sl in rl.get("scopeLogs") or []:
            for record in sl.get("logRecords") or []:
                name = (record.get("body") or {}).get("stringValue", "")
                timestamp_ns = int(record.get("timeUnixNano", "0"))
                timestamp = timestamp_ns // 1_000_000

                attributes: dict[str, Any] = {}
                for attr in record.get("attributes") or []:
                    val = attr.get("value") or {}
                    if "stringValue" in val:
                        attributes[attr["key"]] = val["stringValue"]
                    elif "intValue" in val:
                        attributes[attr["key"]] = val["intValue"]
                    elif "boolValue" in val:
                        attributes[attr["key"]] = val["boolValue"]

                events.append({"name": name, "timestamp": timestamp, "attributes": attributes})
    return events


def parse_otlp_traces(body: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse OTLP trace spans into audit-log-compatible span dicts.

    Extracts tool spans (those with a tool_name attribute) and converts them
    to the format expected by AuditLogPanel: toolName, timestamp, durationMs,
    success, input, toolParameters.
    """
    spans: list[dict[str, Any]] = []
    resource_spans = body.get("resourceSpans")
    if not resource_spans:
        return spans

    for rs in resource_spans:
        for ss in rs.get("scopeSpans") or []:
            for raw_span in ss.get("spans") or []:
                attrs = raw_span.get("attributes") or []
                tool_name = _extract_attr(attrs, "tool_name")
                if not tool_name:
                    continue

                # Parse timestamps (nanoseconds → milliseconds)
                try:
                    start_ns = int(raw_span.get("startTimeUnixNano", "0"))
                except (ValueError, TypeError):
                    start_ns = 0
                try:
                    end_ns = int(raw_span.get("endTimeUnixNano", "0"))
                except (ValueError, TypeError):
                    end_ns = 0

                timestamp_ms = start_ns // 1_000_000
                duration_ms = (end_ns - start_ns) // 1_000_000

                # Extract optional fields
                success_raw = _extract_attr(attrs, "success")
                success = _coerce_bool(success_raw)

                span: dict[str, Any] = {
                    "toolName": tool_name,
                    "timestamp": timestamp_ms,
                    "durationMs": duration_ms,
                    "success": success,
                }

                input_val = _extract_attr(attrs, "input")
                if input_val is not None:
                    span["input"] = input_val

                tool_params = _extract_attr(attrs, "toolParameters")
                if tool_params is not None:
                    span["toolParameters"] = tool_params

                spans.append(span)
    return spans


def _log_event_to_span(event: dict[str, Any]) -> dict[str, Any] | None:
    """Convert a parsed log event to an audit-log span, if it's a tool result."""
    if event.get("name") != "claude_code.tool_result":
        return None

    attrs = event.get("attributes", {})
    tool_name = attrs.get("tool_name")
    if not tool_name:
        return None

    span: dict[str, Any] = {
        "toolName": tool_name,
        "timestamp": event.get("timestamp", 0),
    }

    success_raw = attrs.get("success")
    if success_raw is not None:
        span["success"] = _coerce_bool(success_raw)

    duration = attrs.get("duration_ms")
    if duration is not None:
        span["durationMs"] = duration

    input_val = attrs.get("input")
    if input_val is not None:
        span["input"] = input_val

    return span


class OTLPReceiver:
    """Stateful OTLP receiver that accumulates token stats and spans."""

    def __init__(self) -> None:
        self._token_stats: dict[str, int | float] = {
            "inputTokens": 0,
            "outputTokens": 0,
            "cacheCreationTokens": 0,
            "cacheReadTokens": 0,
            "totalCost": 0,
        }
        self._spans: list[dict[str, Any]] = []

    def get_token_stats(self) -> dict[str, int | float]:
        return {**self._token_stats}

    def aggregate_token_stats(self, data: dict[str, Any]) -> dict[str, int | float]:
        self._token_stats["inputTokens"] += data.get("inputTokens", 0)
        self._token_stats["outputTokens"] += data.get("outputTokens", 0)
        self._token_stats["cacheCreationTokens"] += data.get("cacheCreationTokens", 0)
        self._token_stats["cacheReadTokens"] += data.get("cacheReadTokens", 0)
        self._token_stats["totalCost"] += data.get("totalCost", 0)
        return self.get_token_stats()

    def get_spans(self) -> list[dict[str, Any]]:
        """Return a copy of accumulated spans."""
        return list(self._spans)

    def _store_spans(self, new_spans: list[dict[str, Any]]) -> None:
        """Append spans and enforce MAX_SPANS bound."""
        self._spans.extend(new_spans)
        if len(self._spans) > MAX_SPANS:
            self._spans = self._spans[-MAX_SPANS:]

    def process_metrics(self, body: dict[str, Any]) -> None:
        parsed = parse_otlp_metrics(body)
        if parsed:
            self.aggregate_token_stats(parsed)

    def process_logs(self, body: dict[str, Any]) -> list[dict[str, Any]]:
        """Parse logs and convert tool_result events to spans."""
        events = parse_otlp_logs(body)
        new_spans: list[dict[str, Any]] = []
        for event in events:
            span = _log_event_to_span(event)
            if span:
                new_spans.append(span)
        if new_spans:
            self._store_spans(new_spans)
        return new_spans

    def process_traces(self, body: dict[str, Any]) -> list[dict[str, Any]]:
        """Parse OTLP traces, store as spans, return new spans."""
        new_spans = parse_otlp_traces(body)
        if new_spans:
            self._store_spans(new_spans)
        return new_spans
