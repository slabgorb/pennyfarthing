"""OTLP receiver — port of packages/core/src/server/otlp-receiver.ts.

Parses OpenTelemetry HTTP/JSON payloads (logs, metrics, traces) and
aggregates token usage statistics. Stateless parse functions + stateful
OTLPReceiver class for accumulation.

Story 48-1.
"""

from __future__ import annotations

from typing import Any


def parse_otlp_metrics(body: dict[str, Any]) -> dict[str, int]:
    """Extract token counts from OTLP metrics payload.

    Only processes metrics named 'claude_code.token.usage'.
    Returns dict with keys: inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens.
    """
    result: dict[str, int] = {}
    resource_metrics = body.get("resourceMetrics")
    if not resource_metrics:
        return result

    for rm in resource_metrics:
        for sm in rm.get("scopeMetrics") or []:
            for metric in sm.get("metrics") or []:
                if metric.get("name") != "claude_code.token.usage":
                    continue
                sum_field = metric.get("sum")
                if not sum_field:
                    continue
                for dp in sum_field.get("dataPoints") or []:
                    attrs = dp.get("attributes") or []
                    type_attr = next(
                        (a for a in attrs if a.get("key") == "type"), None
                    )
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

                events.append(
                    {"name": name, "timestamp": timestamp, "attributes": attributes}
                )
    return events


class OTLPReceiver:
    """Stateful OTLP receiver that accumulates token stats across batches."""

    def __init__(self) -> None:
        self._token_stats: dict[str, int | float] = {
            "inputTokens": 0,
            "outputTokens": 0,
            "cacheCreationTokens": 0,
            "cacheReadTokens": 0,
            "totalCost": 0,
        }

    def get_token_stats(self) -> dict[str, int | float]:
        return {**self._token_stats}

    def aggregate_token_stats(self, data: dict[str, Any]) -> dict[str, int | float]:
        self._token_stats["inputTokens"] += data.get("inputTokens", 0)
        self._token_stats["outputTokens"] += data.get("outputTokens", 0)
        self._token_stats["cacheCreationTokens"] += data.get("cacheCreationTokens", 0)
        self._token_stats["cacheReadTokens"] += data.get("cacheReadTokens", 0)
        return self.get_token_stats()

    def process_metrics(self, body: dict[str, Any]) -> None:
        parsed = parse_otlp_metrics(body)
        if parsed:
            self.aggregate_token_stats(parsed)

    def process_logs(self, body: dict[str, Any]) -> list[dict[str, Any]]:
        return parse_otlp_logs(body)

    def process_traces(self, body: dict[str, Any]) -> None:
        pass  # Trace processing deferred to story 48-2
