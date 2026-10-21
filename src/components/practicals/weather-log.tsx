"use client";

import { useEffect, useMemo, useState } from "react";
import { CloudSun, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { MAX_OBSERVATIONS, sortByDate, summarise, todayIso, validateObservation, type WeatherObservation } from "@/lib/practicals/weather";
import { fmt } from "@/lib/practicals/scale";
import { TextField } from "./fields";

export function WeatherLog({ observations, onChange, persistence }: { observations: WeatherObservation[]; onChange: (o: WeatherObservation[]) => void; persistence: string }) {
  const [today, setToday] = useState("");
  const [form, setForm] = useState({ date: "", temperature: "", rainfall: "", humidity: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = todayIso();
    setToday(t);
    setForm((f) => (f.date ? f : { ...f, date: t }));
  }, []);

  const sorted = useMemo(() => sortByDate(observations), [observations]);
  const summary = useMemo(() => summarise(observations), [observations]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const r = validateObservation(form, observations, today || todayIso());
    if (!r.ok) { setError(r.error); return; }
    setError(null);
    onChange([...observations, r.value]);
    setForm({ date: form.date, temperature: "", rainfall: "", humidity: "" });
  }

  return (
    <Card>
      <CardBody className="space-y-5">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-forest-950"><CloudSun className="h-5 w-5 text-brand-700" aria-hidden /> Weather Observation Log</h3>
          <p className="mt-1 rounded-lg bg-sand-100 px-3 py-2 text-sm text-forest-800">
            These are <strong>your own observations</strong>, made with your own instruments. They are not official meteorological data and can differ from a weather station&apos;s readings. {persistence}
          </p>
        </div>

        <form onSubmit={add} noValidate className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-start">
          <TextField label="Date" type="date" value={form.date} max={today || undefined} onChange={(date) => setForm({ ...form, date })} />
          <TextField label="Temperature (°C)" inputMode="decimal" autoComplete="off" value={form.temperature} onChange={(temperature) => setForm({ ...form, temperature })} />
          <TextField label="Rainfall (mm, 24 h)" inputMode="decimal" autoComplete="off" value={form.rainfall} onChange={(rainfall) => setForm({ ...form, rainfall })} hint="Use 0 for a dry day." />
          <TextField label="Humidity (%) optional" inputMode="decimal" autoComplete="off" value={form.humidity} onChange={(humidity) => setForm({ ...form, humidity })} />
          <div className="sm:col-span-2 lg:col-span-1 lg:pt-[1.7rem]"><Button type="submit" className="w-full">Add observation</Button></div>
        </form>
        <div aria-live="polite">{error && <Alert tone="error">{error}</Alert>}</div>

        {sorted.length === 0 ? (
          <p className="rounded-xl border border-dashed border-sage-300 bg-sage-50/60 px-4 py-6 text-center text-sm text-forest-600">No observations yet. Add your first day above.</p>
        ) : (
          <div role="region" aria-label="Weather observations table" tabIndex={0} className="overflow-x-auto rounded-xl border border-sage-200">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <caption className="sr-only">Your recorded weather observations, oldest first</caption>
              <thead className="bg-sage-50 text-forest-800">
                <tr>
                  <th scope="col" className="px-3 py-2">Date</th><th scope="col" className="px-3 py-2">Temp (°C)</th>
                  <th scope="col" className="px-3 py-2">Rain (mm)</th><th scope="col" className="px-3 py-2">Humidity (%)</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => (
                  <tr key={o.date} className="border-t border-sage-200">
                    <th scope="row" className="px-3 py-2 font-medium">{o.date}</th>
                    <td className="px-3 py-2">{fmt(o.temperatureC, 1)}</td>
                    <td className="px-3 py-2">{fmt(o.rainfallMm, 1)}</td>
                    <td className="px-3 py-2">{o.humidityPct === undefined ? "–" : fmt(o.humidityPct, 0)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" aria-label={`Remove observation for ${o.date}`} onClick={() => onChange(observations.filter((x) => x.date !== o.date))}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-forest-600">{observations.length} of {MAX_OBSERVATIONS} observations.</p>

        {summary && (
          <dl className="grid gap-3 rounded-xl border border-brand-300 bg-brand-50 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Summary of your observations">
            <div><dt className="text-xs font-semibold text-forest-700">Days recorded</dt><dd className="text-lg font-bold text-brand-800">{summary.count}</dd></div>
            <div><dt className="text-xs font-semibold text-forest-700">Average temperature</dt><dd className="text-lg font-bold text-brand-800">{fmt(summary.averageTemperatureC, 1)} °C</dd></div>
            <div><dt className="text-xs font-semibold text-forest-700">Lowest / highest</dt><dd className="text-lg font-bold text-brand-800">{fmt(summary.minTemperatureC, 1)} / {fmt(summary.maxTemperatureC, 1)} °C</dd></div>
            <div><dt className="text-xs font-semibold text-forest-700">Total rainfall</dt><dd className="text-lg font-bold text-brand-800">{fmt(summary.totalRainfallMm, 1)} mm</dd></div>
            <div><dt className="text-xs font-semibold text-forest-700">Days with rain</dt><dd className="text-lg font-bold text-brand-800">{summary.rainyDays}</dd></div>
            <div><dt className="text-xs font-semibold text-forest-700">Wettest day</dt><dd className="text-lg font-bold text-brand-800">{summary.wettest ? `${summary.wettest.date} (${fmt(summary.wettest.rainfallMm, 1)} mm)` : "None"}</dd></div>
            <div><dt className="text-xs font-semibold text-forest-700">Average humidity</dt><dd className="text-lg font-bold text-brand-800">{summary.averageHumidityPct === null ? "Not recorded" : `${fmt(summary.averageHumidityPct, 1)} % (${summary.humidityCount} days)`}</dd></div>
          </dl>
        )}
      </CardBody>
    </Card>
  );
}
