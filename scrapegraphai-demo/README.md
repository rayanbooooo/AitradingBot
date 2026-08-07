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
cp .env.example .env  # add your ANTHROPIC_API_KEY (and GOOGLE_MAPS_API_KEY for find_businesses.py)
```

## Run

```bash
python example.py
```

`example.py` uses `SmartScraperGraph` to scrape a page and answer a
natural-language prompt about its content via an LLM.

## Business lead finder (`find_businesses.py`)

Finds businesses matching a Google Places text query, keeps only the ones
with no `website` field, and best-effort looks up an email address and
social media links for each via ScrapeGraphAI's `SearchGraph`.

```bash
python find_businesses.py --query "restaurants in Antwerp, Belgium" --max-results 40 --out businesses.csv
```

Requires, in `.env`:
- `GOOGLE_MAPS_API_KEY` — a Google Maps Platform key with the **Places API**
  enabled and billing configured (https://console.cloud.google.com/).
- `ANTHROPIC_API_KEY` (default) or `OPENAI_API_KEY` (with `--llm-provider openai`)
  — used by the contact-lookup step.

Flags:
- `--skip-contact-lookup` — only run discovery + website filtering (fast, no LLM calls).
- `--include-with-website` — keep every result instead of filtering to no-website businesses.
- `--llm-provider {anthropic,openai}` — LLM backend for contact lookup (default: `anthropic`).

**Before using this for outreach:** Google's Maps Platform Terms of Service
restrict building contact lists or doing unsolicited messaging from Places
data (https://cloud.google.com/maps-platform/terms), and GDPR / Belgian
e-commerce law constrain unsolicited commercial contact with businesses
found this way. Make sure you have a proper legal basis before emailing
anyone on the output list.

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
