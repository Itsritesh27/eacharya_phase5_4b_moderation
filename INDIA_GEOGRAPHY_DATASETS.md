# India Geography Datasets (Class 9–12)

The Geography Lab now includes an India Geography Datasets hub at `/geography-lab/india-datasets`.
It contains local, source-attributed starter data and lets learners filter records and download CSV files.

## Bundled data

- Census 2011 effective literacy rates by sex (35 States/UTs plus India aggregate)
- Census 2011 total and child sex ratio, rural/urban/overall
- Urban population share for 1991, 2001 and 2011
- IMD monthly rainfall for selected States/UTs in 2023
- IMD 1981–2010 climate normals for Chennai and Jaisalmer
- Rice yield (2021–22, 2022–23), wheat yield (2022–23), and sugarcane yield (2021–22, 2022–23)
- National irrigation indicators (2021–22 and 2022–23)
- India occupational worker-category distribution (Census 2011)
- State/UT installed electricity capacity for 31 March 2022 and 31 March 2023
- Selected state/UT road-length values as reported for 31 March 2020
- Selected mineral and energy locations, plus selected cyclone landfall/impact events
- Official source directory for crop, road, cyclone, electricity and railway reference data

## Provenance and interpretation

Each dataset object in `src/lib/geography-lab/india-datasets.json` has a period, geography, unit, publisher/source link and a caveat displayed in the UI. Historical datasets retain their source's geographic vintage. A selected or partial dataset is explicitly labelled and should not be described as a complete current all-India dataset.

The rail item is a source directory entry, not an embedded numeric series. The current Thematic Map Studio uses world-country boundaries; an India-state choropleth requires a compatible India State/UT boundary layer and a join key that matches these tables. The mineral/energy starter list has place names but intentionally does not invent coordinates.

## Main source references

- Census of India 2011 — Provisional Population Totals: https://censusindia.gov.in/nada/index.php/catalog/42611/download/46274/Census%20of%20India%202011-Provisional%20Population%20Totals.pdf
- MoSPI — Women and Men in India: https://www.mospi.gov.in/sites/default/files/reports_and_publication/statistical_publication/social_statistics/WM17Chapter1.pdf
- MoSPI — Selected Socio-Economic Statistics India: https://mospi.gov.in/sites/default/files/publication_reports/SelectedSocio-EconomicStatisticsIndia2017_27oct17.pdf
- IMD — Rainfall Statistics of India 2023: https://hydro.imd.gov.in/hydrometweb/PRODUCTS/Publications/Rainfall%20Statistics%20of%20India%20-%202023/Rainfall%20Statistics%20of%20India%202023.pdf
- IMD climate normals — Chennai: https://city.imd.gov.in/citywx/extreme/JAN/chennai2.htm; Jaisalmer: https://city.imd.gov.in/citywx/extreme/JAN/jaisalmer2.htm
- Department of Agriculture & Farmers Welfare — Agricultural Statistics at a Glance 2023: https://www.desagri.gov.in/wp-content/uploads/2024/09/Agricultural-Statistics-at-a-Glance-2023.pdf
- Department of Agriculture & Farmers Welfare — Land Use Statistics at a Glance 2022–23: https://desagri.gov.in/wp-content/uploads/2024/09/Final-file-of-LUS-2022-23-for-uploading.pdf
- Central Electricity Authority — General Review 2024: https://cea.nic.in/wp-content/uploads/general/2024/General_Review_2024_2.pdf
- MoRTH — Basic Road Statistics of India 2019–20: https://morth.nic.in/sites/default/files/Basic%20Road%20Statistics%20of%20India-2019-20.pdf
- IMD RSMC New Delhi — Cyclone information: https://rsmcnewdelhi.imd.gov.in/
- DES crop area, production and yield query: https://data.desagri.gov.in/website/crops-apy-report-web
- MoSPI EnviStats India 2024, Table 1.08 (annual/monthly rainfall sourced from IMD): https://www.mospi.gov.in/sites/default/files/reports_and_publication/statistical_publication/EnviStats/Complete_ES1_2024.pdf
- Long-run actual rainfall by IMD meteorological subdivision, 1901–2025 (collated from the RBI Handbook of Statistics on Indian States and IMD): https://dataful.in/datasets/5814/
