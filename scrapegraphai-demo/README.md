# ScrapeGraphAI demo

Minimal Python setup for [ScrapeGraphAI](https://github.com/ScrapeGraphAI/Scrapegraph-ai),
an LLM-powered web scraping library.

## Setup

```bash
cd scrapegraphai-demo
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install
cp .env.example .env  # add your OPENAI_API_KEY
```

## Run

```bash
python example.py
```

`example.py` uses `SmartScraperGraph` to scrape a page and answer a
natural-language prompt about its content via an LLM.

## Known upstream issue

As of scrapegraphai 1.70.0-1.76.0 on PyPI, `scrapegraphai.nodes.generate_answer_node`
does `from langchain_community.chat_models import ChatOllama`, but that symbol
was removed from `langchain-community` in its 0.4.x line — the only line that
satisfies scrapegraphai's own `langchain-community>=0.4.0` requirement. A plain
`pip install scrapegraphai` therefore fails on import with:

```
ImportError: cannot import name 'ChatOllama' from 'langchain_community.chat_models'
```

`_compat.py` works around this by re-exposing `ChatOllama` (from
`langchain-ollama`, already a scrapegraphai dependency) on the
`langchain_community.chat_models` module before scrapegraphai is imported.
Import it first, as `example.py` does:

```python
import _compat  # noqa: F401
from scrapegraphai.graphs import SmartScraperGraph
```
