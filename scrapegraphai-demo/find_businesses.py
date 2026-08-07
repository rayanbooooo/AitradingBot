"""Find businesses via Google Places, filter to those without a website,
and try to find an email / social links for each via ScrapeGraphAI.

This is a two-stage pipeline:

  1. Discovery: Google Places Text Search + Place Details (official API,
     not scraped) for a free-text query like "restaurants in Antwerp,
     Belgium". Places whose `website` field is empty are kept.
  2. Enrichment: for each business without a website, ask ScrapeGraphAI's
     SearchGraph to search the web and extract a public email address and
     social media links (Facebook/Instagram/LinkedIn), best-effort.

Requires:
  - GOOGLE_MAPS_API_KEY with the "Places API" enabled and billing set up
    (https://console.cloud.google.com/).
  - An LLM key for scrapegraphai, e.g. OPENAI_API_KEY.

Usage:
    python find_businesses.py --query "restaurants in Antwerp, Belgium" \
        --max-results 40 --out businesses.csv

Legal note: Google's Maps Platform Terms of Service restrict how Places
data may be used (in particular, building contact lists or using it for
unsolicited messaging is prohibited: see
https://cloud.google.com/maps-platform/terms). GDPR and Belgian e-commerce
law also constrain unsolicited commercial contact with businesses found
this way. Make sure your use case has a proper legal basis before doing
outreach with this data.
"""

import argparse
import csv
import os
import sys
import time

import requests
from dotenv import load_dotenv

import _compat  # noqa: F401  (must import before scrapegraphai, see _compat.py)
from scrapegraphai.graphs import SearchGraph

load_dotenv()

PLACES_TEXTSEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
DETAILS_FIELDS = "name,formatted_address,formatted_phone_number,international_phone_number,website,url"


def search_places(query, api_key, max_results):
    results = []
    params = {"query": query, "key": api_key}
    while True:
        resp = requests.get(PLACES_TEXTSEARCH_URL, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            raise RuntimeError(f"Places Text Search error: {data.get('status')} {data.get('error_message', '')}")
        results.extend(data.get("results", []))
        next_token = data.get("next_page_token")
        if not next_token or len(results) >= max_results:
            break
        time.sleep(2)  # next_page_token isn't valid immediately
        params = {"pagetoken": next_token, "key": api_key}
    return results[:max_results]


def get_place_details(place_id, api_key):
    params = {"place_id": place_id, "fields": DETAILS_FIELDS, "key": api_key}
    resp = requests.get(PLACES_DETAILS_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "OK":
        return {}
    return data.get("result", {})


def find_contact_info(name, address, llm_config):
    prompt = (
        f"Search the web for the business '{name}' located at '{address}'. "
        "Find its public contact email address and any social media profile "
        "URLs (Facebook, Instagram, LinkedIn). Respond with a JSON object "
        "with keys 'email', 'facebook', 'instagram', 'linkedin' — use null "
        "for anything you can't find."
    )
    graph = SearchGraph(prompt=prompt, config=llm_config)
    try:
        return graph.run()
    except Exception as exc:  # best-effort enrichment, never fatal
        print(f"  [warn] contact lookup failed for {name}: {exc}", file=sys.stderr)
        return {}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", required=True, help='e.g. "restaurants in Antwerp, Belgium"')
    parser.add_argument("--max-results", type=int, default=40)
    parser.add_argument("--out", default="businesses.csv")
    parser.add_argument(
        "--skip-contact-lookup",
        action="store_true",
        help="Only do discovery + website filtering, skip the slower email/social lookup step.",
    )
    parser.add_argument(
        "--include-with-website",
        action="store_true",
        help="Keep all businesses, not just ones missing a website.",
    )
    args = parser.parse_args()

    maps_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not maps_key:
        sys.exit("GOOGLE_MAPS_API_KEY is not set (add it to .env)")

    llm_config = {
        "llm": {
            "api_key": os.environ["OPENAI_API_KEY"],
            "model": "openai/gpt-4o-mini",
        },
        "verbose": False,
        "headless": True,
    }

    print(f"Searching Google Places for: {args.query!r}")
    places = search_places(args.query, maps_key, args.max_results)
    print(f"Found {len(places)} places, fetching details...")

    businesses = []
    for place in places:
        details = get_place_details(place["place_id"], maps_key)
        if not details:
            continue
        has_website = bool(details.get("website"))
        if has_website and not args.include_with_website:
            continue
        businesses.append(details)

    print(f"{len(businesses)} businesses match the filter (website missing: {not args.include_with_website}).")

    rows = []
    for biz in businesses:
        name = biz.get("name", "")
        address = biz.get("formatted_address", "")
        row = {
            "name": name,
            "address": address,
            "phone": biz.get("formatted_phone_number", ""),
            "website": biz.get("website", ""),
            "google_maps_url": biz.get("url", ""),
            "email": "",
            "facebook": "",
            "instagram": "",
            "linkedin": "",
        }
        if not args.skip_contact_lookup:
            print(f"Looking up contact info for: {name}")
            contact = find_contact_info(name, address, llm_config)
            if isinstance(contact, dict):
                row["email"] = contact.get("email") or ""
                row["facebook"] = contact.get("facebook") or ""
                row["instagram"] = contact.get("instagram") or ""
                row["linkedin"] = contact.get("linkedin") or ""
        rows.append(row)

    fieldnames = ["name", "address", "phone", "website", "google_maps_url", "email", "facebook", "instagram", "linkedin"]
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} businesses to {args.out}")


if __name__ == "__main__":
    main()
