# 02 · Data source: Oikotie

_Version 1, 2026-11-10. Everything here was observed in a real browser on 2026-11-08…10 unless marked **unverified**. Requirements are in [01-requirements.md](01-requirements.md), the design in [03-design.md](03-design.md)._

## 1. Summary
- Source: `https://asunnot.oikotie.fi`, the rentals section (`cardType=101`).
- Two JSON endpoints are used: **search** (lists of cards) and **card** (one listing's full detail).
- **The API answers only inside a real browser.** Node and PowerShell clients get HTTP 403 even with valid tokens and cookies (verified 2026-11-10). This is why data is captured with a script the user pastes into DevTools.
- Size of the job on 2026-11-10: **381 listings** in the 17 postal codes with size ≥ 40 m² and rent ≤ 1400 €. That is 4 search pages plus 381 detail requests for the first run.

## 2. Access and authentication
Every API request needs three headers. Their values are in `<meta>` tags on any Oikotie HTML page:

| Header | Meta tag | Notes |
|---|---|---|
| `OTA-token` | `<meta name="api-token">` | Lifetime unknown |
| `OTA-cuid` | `<meta name="cuid">` | |
| `OTA-loaded` | `<meta name="loaded">` | Unix timestamp of the page load |

- Missing tokens gave 401 (2026-11-08). Non-browser clients get 403 regardless (2026-11-10).
- The meta tags don't change without a page reload.
- **Content-Security-Policy:** `default-src 'self' https: wss: 'unsafe-inline' 'unsafe-eval'`. Pasted console scripts run, but the page **cannot connect to `http://localhost`**. Data must leave the browser as a downloaded file.

## 3. Search endpoint
```
GET /api/search?cardType=101
               &locations=<url-encoded JSON>
               &size[min]=40
               &price[max]=1400
               &limit=100
               &offset=<N>
               &sortBy=published_sort_desc
              [&published=1|2|4]
```

| Parameter | Meaning |
|---|---|
| `cardType=101` | Rentals |
| `locations` | JSON array of `[<locationId>, <level>, "<label>"]`. A postal code is `[<zipId>,5,"<zip>"]`; several can go in one array. A city is `[[837,6,"Tampere"]]`. |
| `size[min]`, `price[max]` | The only content filters this project sends |
| `limit`, `offset` | Paging. `limit=100` works. |
| `sortBy=published_sort_desc` | Newest (by bump time) first |
| `published` | Optional age filter: `1` = under 1 day, `2` = under 2 days, `4` = under a week |

**Response**
```
{ found, start,
  cards: [ {
    cardId, cardType, url, status,
    data:     { description, rooms, roomConfiguration, price: "1 170 € / kk", size: "42 m²",
                sizeMin, sizeMax, buildYear, visits, visitsWeekly, … },
    location: { address, district, city, zipCode, latitude, longitude },
    meta:     { published, publishedSort, priceChanged, contractType, listingType, vendorAdId, … },
    medias:   [ { imageSmallJPEG, imageLargeJPEG, imageDesktopWebP, … } ],
    company:  { companyName, … }
  } ] }
```

**Behaviour to design around**
- **The age filter keys on the original `meta.published`.** A bumped or re-listed ad keeps its old `published` and only gets a new `publishedSort`, so it never shows up in an age-filtered search. Neither do price edits or removals. A periodic **full sweep** is therefore required. (2026-11-10: `published=1/2/4` returned 25 / 28 / 97 of 381.)
- `data.visits` and `data.visitsWeekly` change constantly. They must be **excluded from the card hash**.
- Search **cannot** filter by move-in date or lease type. Those are filtered locally.
- Some listings have no zip location id in their detail, but zip-filtered search still returns them.
- **Placeholder coordinates:** addresses Oikotie couldn't geocode get the fixed point 64.5498 N, 29.5323 E (near Kuhmo, about 450 km away). On 2026-11-10 that was 17 of 381 cards. The importer treats it, and any point over 50 km from the first configured place, as "no coordinates" (the detail's own point is used if it is plausible).
- Card `meta.published` / `publishedSort` arrive as `"YYYY-MM-DD HH:mm:ss"` **without a zone marker**; they are UTC (verified: exactly 2 h before the detail's local `published` in November).

## 4. Detail endpoint
```
GET /api/card/{cardId}
```
Top-level keys: `cardId`, `status`, `published`, `meta{created, lastModified}`, `building{…}`, `adData{~379 keys}`, `address{city{cardId:386}, zipCode{cardId, name}, districts[], street, …}`, `coordinates{latitude, longitude}`, `company`, `priceData{price}`, `media`, `contact`.

- `status = 1` means active. Any other value, or HTTP 404, is treated as removed.
- Useful `adData` keys by topic:

| Topic | Keys |
|---|---|
| Availability and lease | `availabilityDate` (YYYY-MM-DD or null), `availabilityInfo`, `rentTermInfo` (free text, often null), `fixedTerm`, `fixedTermEnd`, `fixedTermMonths`, `fixedTermContinuesAsIndefinite`, `minRentTimeMonths` |
| Size and layout | `size`, `rooms`, `roomConfiguration` |
| Costs | `securityDeposit`, `securityDepositInfo`, `waterFee`, `waterFeeInfo`, `electricFee` |
| Other terms | `petsAllowed`, `rentFurnished` |
| Building | `buildingOverrideBuildYear`, `buildingOverrideBuildingType`, `floor`, `floorCount`, `apartmentCondition` |
| Text | `title`, `description` |
| Housing form | `habitationRentType`, `aiHabitationRentTypes` |

**Housing-form codes** (`habitationRentType`; stored, never used to filter the crawl):

| Code | Meaning | Code | Meaning |
|---|---|---|---|
| 1 | appears in data, meaning **unverified** | 6 | service housing |
| 2 | sublet | 7 | employer housing |
| 3 | Arava / interest-subsidised | 8 | student housing |
| 4 | room in a shared flat (*solu*) | 9 | privately financed |
| 5 | senior housing | | |

**Building-type codes** (`buildingOverrideBuildingType`): only `1` = *kerrostalo* is likely. The mapping is **unverified**, so the raw code is stored and labels are added only once confirmed.

## 5. Timestamps
| Where | Zone |
|---|---|
| Search card `meta.published`, `meta.publishedSort` | **UTC** |
| Detail `published`, `meta.created`, `meta.lastModified` | **Europe/Helsinki local time** (UTC+2 in winter, UTC+3 in summer) |

Rules:
- Everything is stored as UTC ISO 8601 (`…Z`).
- Local times are converted with the `Europe/Helsinki` zone through `Intl`, never a fixed +2 h.
- `adData.availabilityDate` is a plain calendar date and is stored as is (`YYYY-MM-DD`), with no zone conversion.
- Verified format on 2026-11-10 (trial capture): both sides use `"YYYY-MM-DD HH:mm:ss"`, e.g. card `"2026-11-10 12:35:12"` (UTC) and detail `"2026-11-10 14:35:12"` (Helsinki). The parser still rejects, rather than guesses, anything it doesn't recognise (the raw value stays in the JSON either way).

## 6. Field reference
How each database column is filled. "Card" is the search card (`search_json`), "Detail" is the detail response (`detail_json`). Card fields are refreshed on every sweep, so **the card wins where both have the value**; detail-only fields come from the detail.

| Column | Primary source | Fallback | Notes |
|---|---|---|---|
| `card_id` | Card `cardId` | Detail `cardId` | Primary key |
| `url` | Card `url` | | |
| `status` | Detail `status` | Card `status` | 1 = active |
| `published_at` | Card `meta.published` | Detail `published` (local → UTC) | Original publication |
| `published_sort_at` | Card `meta.publishedSort` | | Bump time |
| `price_changed_at` | Card `meta.priceChanged` | | Value type **unverified** (timestamp or flag); stored as received |
| `address` | Card `location.address` | Detail `address.street…` | |
| `district` | Card `location.district` | Detail `address.districts[0]` | |
| `zip` | Card `location.zipCode` | Detail `address.zipCode.name` | |
| `lat`, `lon` | Card `location.latitude/longitude` | Detail `coordinates.*`, then the postal-code centre (`config.areas[].lat/lon`, else detail `address.zipCode.coordinates`) | Placeholder or implausible points are skipped (§3) |
| `location_approx` | computed | | 1 when `lat`/`lon` is a postal-code centre, not the home; 0 otherwise |
| `dist_centre_km`, `dist_station_km` | computed | | Haversine from `lat`/`lon` to `config.places` |
| `rent_eur` | Card `data.price` (parsed from "1 170 € / kk") | Detail `priceData.price` | Number |
| `size_m2` | Card `data.sizeMin` | Card `data.size` (parsed), Detail `adData.size` | Number |
| `rooms` | Card `data.rooms` | Detail `adData.rooms` | |
| `room_config` | Card `data.roomConfiguration` | Detail `adData.roomConfiguration` | e.g. `2h+kk+s` |
| `build_year` | Card `data.buildYear` | Detail `adData.buildingOverrideBuildYear`, then `building.*` | |
| `building_type` | Detail `adData.buildingOverrideBuildingType` | | Raw code |
| `floor`, `floor_count` | Detail `adData.floor`, `adData.floorCount` | | |
| `available_date` | Detail `adData.availabilityDate` | | `YYYY-MM-DD` or NULL |
| `availability_text` | Detail `adData.availabilityInfo` | | Free text |
| `lease_text` | Detail `adData.rentTermInfo` | | Free text, often NULL |
| `deposit_eur` | Detail `adData.securityDeposit` | | Numeric if it parses cleanly, else NULL (text stays in JSON) |
| `water_fee` | Detail `adData.waterFee` | Detail `adData.waterFeeInfo` | Text. `waterFee` is a number (e.g. `18`); the info is free text (e.g. "28 €/hlö/kk") |
| `electric_fee` | Detail `adData.electricFee` | | Text; null in every trial sample |
| `pets_allowed`, `furnished` | Detail `adData.petsAllowed`, `adData.rentFurnished` | | Stored as received; encoding **unverified** |
| `company_name` | Card `company.companyName` | Detail `company.*` | |
| `search_json`, `detail_json` | whole responses | | Unmodified |

Anything not listed is one query away, for example:
```sql
SELECT card_id,
       json_extract(detail_json, '$.adData.fixedTerm')            AS fixed_term,
       json_extract(detail_json, '$.adData.fixedTermEnd')         AS fixed_term_end,
       json_extract(detail_json, '$.adData.habitationRentType')   AS housing_form
FROM v_window;
```

**Photos:** list thumbnails use the card's `medias[0].imageSmallJPEG`; larger views use `imageLargeJPEG` or the detail's `media`. Images are loaded by the browser straight from Oikotie's CDN and are never downloaded or stored.

## 7. Postal codes and location ids
The crawl area (17 codes, about 5 km around Keskustori):

| zip | id | zip | id | zip | id |
|---|---|---|---|---|---|
| 33100 | 154182 | 33240 | 161014 | 33530 | 147887 |
| 33180 | 158927 | 33250 | 155343 | 33540 | 156702 |
| 33200 | 154198 | 33270 | 160050 | 33700 | 148730 |
| 33210 | 154077 | 33410 | 163703 | 33800 | 157825 |
| 33230 | 154580 | 33500 | 156055 | 33820 | 152760 |
| | | 33520 | 159635 | 33900 | 157531 |

Other Tampere codes, should the area be widened: 33300=156680, 33310=161531, 33330=162355, 33340=161657, 33400=163722, 33420=160313, 33560=147928, 33580=149469, 33610=149876, 33680=166477, 33710=149053, 33720=152984, 33840=165389, 33850=166388, 33870=5080637, 34240=153960.

An unknown code's id can be read from any stored listing in that code: `address.zipCode.cardId` in the detail JSON (it is null on some listings).

## 8. Other sources (for the web UI)
**Base-map tiles** (all verified to load; attribution is required on the map):

| Name | URL template (`{z}/{y}/{x}` for Esri, `{z}/{x}/{y}` for the others) | Terms |
|---|---|---|
| Esri Dark Gray canvas + reference labels | `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}` (labels: `…/Canvas/World_Dark_Gray_Reference/…`) | Esri attribution; native zoom 16 |
| Esri World Imagery + places labels | `…/World_Imagery/MapServer/tile/{z}/{y}/{x}` (labels: `…/Reference/World_Boundaries_and_Places/…`) | Esri attribution |
| Esri Hillshade Dark | `…/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}` | Blended over the dark canvas; native zoom 16 |
| OpenTopoMap | `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` | CC-BY-SA, attribution to OSM and OpenTopoMap |
| OpenStreetMap standard | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | OSM tile usage policy; fine for light personal use (not used by the UI now) |

**Not usable (checked 2026-11-11):** CARTO Voyager and Positron now return an "API KEY REQUIRED" image on every tile (HTTP 200, so a status check misses it: look at the image). The National Land Survey (MML) background map needs a key. `tile.openstreetmap.fr` is blocked in the agent's browser pane, so it could not be verified.

**Postal-area polygons:** Statistics Finland, Paavo WFS, CC BY 4.0. Property `posti_alue` is the code and `nimi` the name. Fetched once and saved to `web/public/postal-areas.geojson`:
```
https://geo.stat.fi/geoserver/postialue/wfs?service=WFS&version=2.0.0&request=GetFeature
  &typeNames=postialue:pno_2026&outputFormat=application/json&srsName=EPSG:4326
  &CQL_FILTER=<url-encoded: kunta='837'>
```

**Ground intel for NV (FR-43, checked 2026-11-12).** Fetched by `npm run infra` into `web/public/infra.json`; the browser never calls these services.

| Data | Source | Terms | What is kept |
|---|---|---|---|
| Tram and bus stops | Nysse GTFS, `https://data.itsfactory.fi/journeys/files/gtfs/latest/gtfs_tampere.zip` (Tampere open data, ITS Factory; ~16 MB zip, updated daily, no key) | CC BY 4.0 (data.tampere.fi lists the dataset "Tampereen joukkoliikenteen aikataulut ja reitit (GTFS)" as CC-BY-4.0) | `stops.txt`: `stop_code` (4 digits, e.g. `0805`; equal to `stop_id` in every row), `stop_name` (with the platform letter, e.g. "Keskustori A"), position. Tram or bus comes from `route_type` (0 tram, 3 bus) of the routes whose trips stop there (`stop_times.txt` → `trips.txt` → `routes.txt`). Each direction is its own stop with its own number. Stops no trip calls at are dropped. In the area: 1,020 stops, 66 tram and 954 bus; none is served by both. |
| Grocery stores | OpenStreetMap through Overpass, `https://overpass-api.de/api/interpreter`, `nwr["shop"~"^(supermarket\|convenience)$"]` in the box, `out center tags` | ODbL 1.0, "© OpenStreetMap contributors" | Only the chosen chains, by `brand` tag (else the name): Kesko 50 (K-Citymarket 4, K-Supermarket 10, K-Market 35, K-KoskiHerkku 1), S-ryhmä 29 (Prisma 6, S-market 8, Sale 15; there is no Alepa in Tampere), Lidl 11. Name = chain + `branch` tag; `opening_hours` (89 of 90 have it; all parse); `check_date:opening_hours` or `check_date` (46 have one, from 2022 to 2026). |

Overpass answered 504 and 502 on the first tries (busy); the script waits 15 s and retries twice. It needs a User-Agent (curl's default got 406). Also in the area but **left out** by the user's choice: Tokmanni 7, ethnic and other independent food shops (~20), Stockmann and Sokos, Metro (wholesale), ABC (petrol station). **Chain sites are not usable** (checked 2026-11-12): s-kaupat.fi answers non-browser clients with a bot checkpoint (429) and k-ruoka.fi store pages with 403, the same situation as Oikotie, so they are not used (no disguised clients); lidl.fi's robots.txt allows its store pages, but OSM already has the hours of all 11 Lidls.

## 9. Unknowns
| Unknown | How it is handled |
|---|---|
| Token lifetime; whether tokens expire during a 13-minute run | On a 401 the script re-reads the meta tags and retries once, then stops and saves. A re-run after a page reload is cheap because of the built-in state. |
| "Multiple downloads" prompt in Chrome or Edge | The script makes exactly one download per run. |
| Background-tab throttling (Chrome limits timers in tabs hidden for over 5 minutes) | The panel tells the user to keep the tab in the foreground. |
| `buildingOverrideBuildingType` codes; `habitationRentType` code 1 | Raw codes are stored; labels are added when confirmed. |
| Value formats of fees, deposit, pets, furnished, `priceChanged` | Partly seen in the 5-detail trial (2026-11-10): `petsAllowed` is `1` or null, `securityDeposit` a number or null (then `securityDepositInfo` holds text such as "2 kuukauden vuokra"), `rentFurnished` null in all 5. Stored as received; re-check after the full capture. |
| Move-in date often only in text | Full capture (2026-11-10, 381 details): 136 have `availabilityDate` null; nearly all of those carry `availabilityInfo` text: "heti (vapaa)" in some spelling (~93), "Vapaa 01.12.2026" / "01.12.2026." / "2026-12-01" (~30), a few "sopimuksen mukaan" and ranges such as "Vapaana 2.11.2026-31.12.2026". They count as "no date" and stay in `v_window`. Parsing the text into a derived date is the main candidate improvement. |
| Lease type | `fixedTerm` is null on **all** 381 details; `fixedTermMonths` is set on 9, `fixedTermEnd` on 3. The lease type lives in `rentTermInfo` free text (186 of 381): 175 mention *toistaiseksi*, 61 *määräaikai*, 50 both (e.g. "fixed 12 months, then indefinite"). |
| Rent rounding | The card's price is whole euros ("975 € / kk"); `priceData.price` has cents (974.57). They differ by under €1 on 48 listings. `rent_eur` uses the card value. |
| Building-type codes | `buildingOverrideBuildingType`: 1 on 359, 256 on 19, 2 on 3. Meanings of 256 and 2 still unverified. |
| Placeholder coordinates | The 17 placeholder listings have the same placeholder in the detail (`coordinates` and `building.coordinates`). **Resolved 2026-11-11 (user's choice):** they are placed at their postal-code centre and flagged `location_approx = 1`. The centres are Oikotie's own `address.zipCode.coordinates`, consistent across all details of a code, copied into `config.areas`. |
| Firefox | Not tested. Chrome and Edge are the targets. |

## 10. Compliance and guardrails
**Facts**
- `robots.txt` has `Disallow: /api*` for all bots and `Disallow: /` for Anthropic's agents (`ClaudeBot`, `anthropic-ai`).
- Section 6 of Oikotie's terms forbids storing content without consent.
- The user has accepted this risk for **personal, private use**.

**Guardrails** (agreed with the user; changing any of them needs the user's explicit decision)
1. **No disguise.** No crawler that pretends to be a browser: no spoofed User-Agent, no Playwright or Puppeteer stealth, no headless workaround for the 403.
2. **The user runs the capture,** in their own browser, when they choose. An AI agent never runs the bulk capture through its own browser. A smoke test of at most 2 detail requests is allowed only with the user's OK.
3. **Polite pacing.** One request at a time, about 2 s apart plus jitter.
4. **Stop when blocked.** A 403 or 429 ends the run; nothing tries to get around it.
5. **Personal use only.** The data is for the user alone: never shared with or published for others. The user may host a copy for their own use (decided 2026-11-11; this replaced "local only", which also forbade hosted pages). Aggregate numbers (counts) are fine.
6. **No images stored.** Only URLs.
