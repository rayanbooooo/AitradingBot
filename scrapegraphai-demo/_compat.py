"""Compatibility shim for scrapegraphai on current PyPI releases.

As of scrapegraphai 1.70.0-1.76.0, ``scrapegraphai.nodes.generate_answer_node``
does ``from langchain_community.chat_models import ChatOllama``, but that
symbol was removed from langchain-community in the 0.4.x line (the only line
satisfying scrapegraphai's own ``langchain-community`` requirement). This
patches the attribute back onto the module before scrapegraphai imports it.

Import this module before importing anything from ``scrapegraphai``.
"""

import langchain_community.chat_models as _chat_models

if not hasattr(_chat_models, "ChatOllama"):
    from langchain_ollama import ChatOllama

    _chat_models.ChatOllama = ChatOllama
