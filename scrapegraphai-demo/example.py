"""Minimal ScrapeGraphAI usage example.

Scrapes a page and answers a natural-language prompt about its content
using an LLM-driven extraction graph.

Usage:
    pip install -r requirements.txt
    playwright install
    cp .env.example .env  # fill in OPENAI_API_KEY
    python example.py
"""

import os

import _compat  # noqa: F401  (must import before scrapegraphai, see _compat.py)
from dotenv import load_dotenv
from scrapegraphai.graphs import SmartScraperGraph

load_dotenv()

graph_config = {
    "llm": {
        "api_key": os.environ["OPENAI_API_KEY"],
        "model": "openai/gpt-4o-mini",
    },
    "verbose": True,
    "headless": True,
}

smart_scraper_graph = SmartScraperGraph(
    prompt="List me all the titles and a short summary of the news articles",
    source="https://perinim.github.io/projects",
    config=graph_config,
)

if __name__ == "__main__":
    result = smart_scraper_graph.run()
    print(result)
