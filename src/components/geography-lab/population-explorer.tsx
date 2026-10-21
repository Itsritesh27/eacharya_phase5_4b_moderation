"use client";

import { useMemo, useState } from "react";
import { BarChart3, Users } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { calculatePopulationMetrics, POPULATION_PROFILES } from "@/lib/geography-lab/population-data";

const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function PopulationExplorer() {
  const [profileId, setProfileId] = useState(POPULATION_PROFILES[0]!.id);
  const selected = POPULATION_PROFILES.find((item) => item.id === profileId) ?? POPULATION_PROFILES[0]!;
  const metrics = useMemo(() => calculatePopulationMetrics(selected), [selected]);
  const maxDensity = Math.max(...POPULATION_PROFILES.map((item) => calculatePopulationMetrics(item).densityPerKm2));

  return (
    <div className="space-y-5">
      <Card><CardBody className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><label htmlFor="population-profile" className="block text-sm font-semibold">Choose a settlement example</label><select id="population-profile" value={profileId} onChange={(e) => setProfileId(e.target.value)} className="mt-1 h-11 min-w-64 rounded-xl border border-sage-300 bg-white px-3 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{POPULATION_PROFILES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Synthetic demonstration data</span></div>
        <h2 className="text-xl font-extrabold">{selected.name}</h2><p className="text-sm text-forest-600">{selected.description}</p>
      </CardBody></Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardBody><p className="text-sm text-forest-600">Population</p><p className="mt-1 text-2xl font-extrabold">{numberFormat.format(selected.population)}</p><p className="text-xs text-forest-600">Current example value</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-forest-600">Area</p><p className="mt-1 text-2xl font-extrabold">{numberFormat.format(selected.areaKm2)} km²</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-forest-600">Population density</p><p className="mt-1 text-2xl font-extrabold">{numberFormat.format(metrics.densityPerKm2)}</p><p className="text-xs text-forest-600">People per km²</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-forest-600">Population growth</p><p className="mt-1 text-2xl font-extrabold">{metrics.growthPercent.toFixed(1)}%</p><p className="text-xs text-forest-600">Compared with previous example value</p></CardBody></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardBody className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><BarChart3 className="h-5 w-5 text-brand-700" aria-hidden/> Compare population density</h2>
          <p className="text-sm text-forest-600">Density = population ÷ area. Select a settlement above to highlight it.</p>
          <div className="space-y-4" role="img" aria-label="Horizontal bar chart comparing population density of the five synthetic settlement examples">
            {POPULATION_PROFILES.map((profile) => {
              const density = calculatePopulationMetrics(profile).densityPerKm2;
              const active = profile.id === selected.id;
              return <div key={profile.id}><div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className={active ? "font-bold text-brand-800" : "text-forest-800"}>{profile.name}</span><span className="tabular-nums font-semibold">{numberFormat.format(density)} / km²</span></div><div className="h-3 overflow-hidden rounded-full bg-sage-100"><div className={`h-full rounded-full ${active ? "bg-brand-600" : "bg-sage-500"}`} style={{ width: `${Math.max(1, (density / maxDensity) * 100)}%` }}/></div></div>;
            })}
          </div>
        </CardBody></Card>

        <Card><CardBody className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5 text-brand-700" aria-hidden/> Age structure</h2>
          <p className="text-sm text-forest-600">Share of population in three broad age groups for the selected example.</p>
          <div className="flex h-9 w-full overflow-hidden rounded-lg" role="img" aria-label={`Age structure: 0 to 14 years ${selected.age0to14Pct} percent, 15 to 59 years ${selected.age15to59Pct} percent, 60 years and over ${selected.age60PlusPct} percent`}>
            <div className="flex items-center justify-center bg-sky-500 text-xs font-bold text-white" style={{ width: `${selected.age0to14Pct}%` }}>{selected.age0to14Pct}%</div>
            <div className="flex items-center justify-center bg-emerald-600 text-xs font-bold text-white" style={{ width: `${selected.age15to59Pct}%` }}>{selected.age15to59Pct}%</div>
            <div className="flex items-center justify-center bg-amber-500 text-xs font-bold text-forest-950" style={{ width: `${selected.age60PlusPct}%` }}>{selected.age60PlusPct}%</div>
          </div>
          <div className="space-y-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-sky-500"/> 0–14 years</span><strong>{selected.age0to14Pct}%</strong></div><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-600"/> 15–59 years</span><strong>{selected.age15to59Pct}%</strong></div><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-amber-500"/> 60 years and over</span><strong>{selected.age60PlusPct}%</strong></div></div>
          <div className="rounded-xl bg-sage-50 p-3 text-sm text-forest-800"><strong>Interpretation prompt:</strong> What might a high working-age share mean for employment, transport and housing needs?</div>
        </CardBody></Card>
      </div>
      <p className="text-xs text-forest-600">All population, area, growth and age-share values are synthetic teaching examples, not official statistics for real places. The growth figure is calculated from the two example population values supplied.</p>
    </div>
  );
}
