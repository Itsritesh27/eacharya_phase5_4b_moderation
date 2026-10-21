# Phase 4 — Geography Lab Tool Completion

## What changed

1. **Latitude and Longitude Explorer** (`/geography-lab/latitude-longitude`)
   - Validates latitude from −90 to 90 and longitude from −180 to 180.
   - Shows hemisphere interpretation, angular distance from the Equator and Prime Meridian, a selectable sample place, and a simplified coordinate-grid diagram.
   - Copy action reports success/failure instead of silently doing nothing.

2. **Climate Data Explorer** (`/geography-lab/climate-explorer`)
   - Four selectable educational climate patterns.
   - Monthly rainfall bars and mean-temperature line, a monthly data table and calculated annual/seasonal summaries.
   - All values are synthetic learning examples; they are not official observations or real-station normals.

3. **Population Data Explorer** (`/geography-lab/population-explorer`)
   - Five synthetic settlement profiles.
   - Calculates density as population ÷ area and percentage change against the previous example value.
   - Compares densities and visualises three age groups. All source values are explicitly labelled synthetic, not official statistics.

4. Connected the matching Geography Lab catalogue cards to these routes and replaced the outdated “Most tools are still being built” introduction. Existing map, thematic map and practical routes were retained.

## Database/deployment

No Supabase migration or additional package is needed. The new tools run from bundled educational sample data and do not write student data to the database.

## Verification performed

- TypeScript `tsc --noEmit`: passed.
- Targeted ESLint for touched source and test files: passed.
- Route-existence check: passed for all six Geography Lab cards. Archive integrity: passed with `unzip -t` on the delivered ZIP.
- Automated Vitest could not start in this environment because the shared dependency cache lacks `@rollup/rollup-linux-x64-gnu`. Run `npm ci`, `npm test`, and `npm run build` on the local machine before deployment.
