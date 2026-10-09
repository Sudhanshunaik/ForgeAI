"""Tests for Headroom context optimization proxy daemon."""

import json
from unittest.mock import MagicMock, patch

from agent.headroom_proxy import (
    DEFAULT_HEADROOM_PORT,
    compress_messages_payload,
    estimate_tokens,
    is_headroom_running,
)


def test_estimate_tokens():
    assert estimate_tokens("") == 0
    assert estimate_tokens("hello world") == max(1, len("hello world") // 4)
    assert estimate_tokens("a" * 100) == 25


def test_compress_messages_payload_preserves_system_and_recent():
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "First query"},
        {"role": "tool", "content": json.dumps([{"id": i, "data": "item" * 20} for i in range(20)])},
        {"role": "assistant", "content": "Tool processed."},
        {"role": "user", "content": "Latest query"},
    ]
    compressed, stats = compress_messages_payload(messages)

    assert len(compressed) == len(messages)
    # System prompt preserved verbatim
    assert compressed[0]["content"] == "You are a helpful assistant."
    # Latest turn preserved
    assert compressed[-1]["content"] == "Latest query"
    # Middle tool message was compressed
    assert "elided" in compressed[2]["content"] or len(compressed[2]["content"]) < len(messages[2]["content"])
    assert stats["tokensSaved"] > 0
    assert stats["compressed"] is True


def test_compress_messages_payload_short_messages():
    messages = [
        {"role": "system", "content": "System prompt."},
        {"role": "user", "content": "Short question."},
        {"role": "assistant", "content": "Short answer."},
    ]
    compressed, stats = compress_messages_payload(messages)
    assert len(compressed) == 3
    assert stats["tokensBefore"] == stats["tokensAfter"]


def test_is_headroom_running_mock():
    with patch("agent.headroom_proxy.socket.socket") as mock_socket:
        mock_instance = MagicMock()
        mock_instance.connect_ex.return_value = 0
        mock_socket.return_value.__enter__.return_value = mock_instance

        # Should be detected as responsive via socket probe
        assert is_headroom_running(DEFAULT_HEADROOM_PORT) is True


def test_ensure_headroom_running_already_running():
    from agent.headroom_proxy import ensure_headroom_running
    with patch("agent.headroom_proxy.is_headroom_running", return_value=True):
        assert ensure_headroom_running() is True


def test_ensure_headroom_running_disabled_by_config():
    from agent.headroom_proxy import ensure_headroom_running
    mock_config = MagicMock()
    mock_config.load_config_readonly.return_value = {"headroom": {"enabled": False}}
    with patch.dict("sys.modules", {"hermes_cli.config": mock_config}):
        assert ensure_headroom_running() is False



