"use client";

import { useMemo, useState } from "react";
import { CloudRain, ThermometerSun } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { CLIMATE_PROFILES, MONTHS, summariseClimate } from "@/lib/geography-lab/climate-data";

export function ClimateExplorer() {
  const [profileId, setProfileId] = useState(CLIMATE_PROFILES[0]!.id);
  const profile = CLIMATE_PROFILES.find((item) => item.id === profileId) ?? CLIMATE_PROFILES[0]!;
  const summary = useMemo(() => summariseClimate(profile), [profile]);
  const maxRain = Math.max(100, ...profile.rainfallMm);
  const minTemp = Math.min(0, ...profile.temperatureC);
  const maxTemp = Math.max(40, ...profile.temperatureC);
  const x = (index: number) => 52 + index * (628 / 11);
  const tempY = (temp: number) => 214 - ((temp - minTemp) / (maxTemp - minTemp)) * 160;
  const rainY = (rain: number) => 214 - (rain / maxRain) * 160;

  return (
    <div className="space-y-5">
      <Card><CardBody className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><label htmlFor="climate-profile" className="block text-sm font-semibold">Choose a climate example</label><select id="climate-profile" value={profileId} onChange={(e) => setProfileId(e.target.value)} className="mt-1 h-11 min-w-64 rounded-xl border border-sage-300 bg-white px-3 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{CLIMATE_PROFILES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Illustrative teaching data</span>
        </div>
        <div><h2 className="text-xl font-extrabold">{profile.climateType}</h2><p className="mt-1 text-sm text-forest-600">{profile.explanation}</p></div>
      </CardBody></Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardBody><p className="text-sm text-forest-600">Annual rainfall</p><p className="mt-1 text-2xl font-extrabold">{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(summary.annualRainfallMm)} mm</p><p className="mt-1 text-xs text-forest-600">Sum of 12 monthly values</p></CardBody></Card>
        <Card><CardBody><p className="text-sm text-forest-600">Mean annual temperature</p><p className="mt-1 text-2xl font-extrabold">{summary.meanAnnualTemperatureC.toFixed(1)} °C</p><p className="mt-1 text-xs text-forest-600">Average of monthly means</p></CardBody></Card>
        <Card><CardBody><p className="flex items-center gap-2 text-sm text-forest-600"><ThermometerSun className="h-4 w-4" aria-hidden/> Warmest / coolest</p><p className="mt-1 text-lg font-extrabold">{summary.warmestMonth} / {summary.coolestMonth}</p></CardBody></Card>
        <Card><CardBody><p className="flex items-center gap-2 text-sm text-forest-600"><CloudRain className="h-4 w-4" aria-hidden/> Wettest / driest</p><p className="mt-1 text-lg font-extrabold">{summary.wettestMonth} / {summary.driestMonth}</p></CardBody></Card>
      </div>

      <Card><CardBody className="space-y-3">
        <div><h2 className="text-lg font-bold">Climograph</h2><p className="text-sm text-forest-600">Bars show rainfall; the line shows mean temperature.</p></div>
        <div className="overflow-x-auto">
          <svg viewBox="0 0 720 270" role="img" aria-label={`Illustrative climograph for ${profile.name}. Monthly rainfall bars and temperature line.`} className="min-w-[640px] w-full">
            <rect x="40" y="34" width="650" height="180" rx="8" fill="#f8fafc"/>
            {[0, 1, 2, 3].map((tick) => { const y = 214 - tick * 53.333; return <g key={tick}><line x1="44" y1={y} x2="690" y2={y} stroke="#cbd5e1" strokeDasharray="3 4"/><text x="38" y={y + 3} textAnchor="end" fontSize="10" fill="#475569">{Math.round(maxRain * tick / 3)}</text></g>; })}
            {profile.rainfallMm.map((rain, index) => <rect key={MONTHS[index]} x={x(index) - 13} y={rainY(rain)} width="26" height={214 - rainY(rain)} rx="3" fill="#60a5fa" opacity="0.85"><title>{MONTHS[index]} rainfall: {rain} mm</title></rect>)}
            <polyline points={profile.temperatureC.map((temp, index) => `${x(index)},${tempY(temp)}`).join(" ")} fill="none" stroke="#dc2626" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
            {profile.temperatureC.map((temp, index) => <g key={`temp-${MONTHS[index]}`}><circle cx={x(index)} cy={tempY(temp)} r="4" fill="#dc2626" stroke="#fff" strokeWidth="1.5"><title>{MONTHS[index]} temperature: {temp} °C</title></circle><text x={x(index)} y="232" textAnchor="middle" fontSize="10" fill="#334155">{MONTHS[index]}</text></g>)}
            <text x="45" y="18" fontSize="11" fill="#1d4ed8">Rainfall (mm)</text>
            <text x="687" y="18" textAnchor="end" fontSize="11" fill="#b91c1c">Temperature (°C): {minTemp} to {maxTemp}</text>
            <rect x="200" y="248" width="12" height="8" rx="2" fill="#60a5fa"/><text x="218" y="256" fontSize="10" fill="#334155">Rainfall</text><line x1="286" y1="252" x2="306" y2="252" stroke="#dc2626" strokeWidth="3"/><text x="312" y="256" fontSize="10" fill="#334155">Temperature</text>
          </svg>
        </div>
        <div className="overflow-x-auto rounded-xl border border-sage-200">
          <table className="w-full min-w-[640px] text-left text-sm"><caption className="sr-only">Monthly illustrative temperature and rainfall</caption><thead className="bg-sage-50"><tr><th className="px-3 py-2">Month</th>{MONTHS.map((month) => <th key={month} className="px-2 py-2 text-right">{month}</th>)}</tr></thead><tbody><tr className="border-t border-sage-200"><th className="px-3 py-2">Temp (°C)</th>{profile.temperatureC.map((temp, i) => <td key={MONTHS[i]} className="px-2 py-2 text-right tabular-nums">{temp}</td>)}</tr><tr className="border-t border-sage-200"><th className="px-3 py-2">Rain (mm)</th>{profile.rainfallMm.map((rain, i) => <td key={MONTHS[i]} className="px-2 py-2 text-right tabular-nums">{rain}</td>)}</tr></tbody></table>
        </div>
      </CardBody></Card>
      <p className="text-xs text-forest-600">All values are synthetic teaching examples for learning how to read a climograph. They are not official climate normals or current observations for any real station.</p>
    </div>
  );
}
