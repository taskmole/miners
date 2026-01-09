import requests
from bs4 import BeautifulSoup
import time
import csv
import pandas as pd
from typing import Dict
import re
import json
BASE_URL = "https://europeancoffeetrip.com"


def extract_cafe_links(city_name: str, city_url: str):
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(city_url, headers=headers)
    if response.status_code != 200:
        print(f"Failed to load city guide: {city_url}")
        return []

    # Extract JavaScript data containing cafe information
    pattern = r'cafesToMap\s*=\s*(\[.*?\]);'
    match = re.search(pattern, response.text, re.DOTALL)

    if not match:
        print("Could not find cafesToMap data in page")
        return []

    try:
        cafes_data = json.loads(match.group(1))
    except json.JSONDecodeError as e:
        print(f"Failed to parse cafe data: {e}")
        return []

    cafes = []
    for cafe_data in cafes_data:
        link = cafe_data.get("link", "")
        # Add BASE_URL only if link doesn't already start with http
        if link and not link.startswith("http"):
            link = BASE_URL + link

        cafes.append({
            "city_name": city_name,
            "name": cafe_data.get("name", "Unknown"),
            "link": link,
            "address": cafe_data.get("address", "Address not found"),
            "latitude": cafe_data.get("latitude", ""),
            "longitude": cafe_data.get("longitude", ""),
            "premium": cafe_data.get("premium", False),
            "awards_winner": cafe_data.get("awards_winner", False),
            "featured_photo": cafe_data.get("featured_photo", "")
        })

    return cafes


def extract_cafe_details(cafe_url: str) -> Dict:
    """Extract additional details from individual cafe page"""
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(cafe_url, headers=headers)

    details = {
        "website": "",
        "instagram": "",
        "facebook": "",
        "date_published": "",
        "date_modified": ""
    }

    if response.status_code != 200:
        print(f"Failed to load cafe page: {cafe_url}")
        return details

    soup = BeautifulSoup(response.text, 'html.parser')

    # Extract date published from schema markup
    date_published_pattern = r'"datePublished":"([^"]+)"'
    date_published_match = re.search(date_published_pattern, response.text)
    if date_published_match:
        details["date_published"] = date_published_match.group(1)

    # Extract date modified from schema markup
    date_modified_pattern = r'"dateModified":"([^"]+)"'
    date_modified_match = re.search(date_modified_pattern, response.text)
    if date_modified_match:
        details["date_modified"] = date_modified_match.group(1)

    # Extract social media links - look for links with Social-*.svg images
    social_links = soup.find_all("a", href=True)
    for link in social_links:
        img = link.find("img")
        if img and img.get("src"):
            src = img.get("src", "")
            href = link.get("href", "")

            # Check for specific social media icons
            if "Social-Instagram.svg" in src and "instagram.com" in href:
                details["instagram"] = href
            elif "Social-Facebook.svg" in src and "facebook.com" in href:
                details["facebook"] = href
            elif "Social-Website.svg" in src:
                details["website"] = href

    return details

def store_cafe_info(cafes:list[Dict]):
    # Scrape additional details from each cafe page
    print(f"Scraping details for {len(cafes)} cafes...")
    for i, cafe in enumerate(cafes, 1):
        print(f"  [{i}/{len(cafes)}] {cafe['name']}")
        time.sleep(1)  # Be respectful to the server
        details = extract_cafe_details(cafe['link'])
        cafe.update(details)

    df = pd.DataFrame(cafes)
    df.to_csv("cafe_info.csv", index=False)
    return df



if __name__ == "__main__":
    import sys

    # Get city from command line argument, default to madrid
    city = sys.argv[1] if len(sys.argv) > 1 else "madrid"
    city_guide_url = f"https://europeancoffeetrip.com/{city}"

    print(f"Scraping European Coffee Trip data for: {city.upper()}")
    cafes = extract_cafe_links(city, city_guide_url)

    print(f"\nFound {len(cafes)} cafes in {city.title()}.\n")
    df = store_cafe_info(cafes)
    print("\n✓ Scraping complete!")
    print(f"\nData saved to cafe_info.csv with {len(df)} cafes")
    print(f"Columns: {', '.join(df.columns)}")