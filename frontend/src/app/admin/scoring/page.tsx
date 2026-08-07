'use client';

/**
 * Live scoring editor.
 *
 * The point of this screen is that you can SEE what a weight change does to a
 * real leaderboard before you save it. Moving a slider re-ranks the sample
 * table on the right immediately, using the same engine the server uses.
 */

import { useEffect, useMemo, useState } from 'react';
import { Info, RotateCcw, Save } from 'lucide-react';
import { api, ApiError, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input, Notice, Select, Skeleton } from '@/components/ui';
import { Meter } from '@/components/bits';
import { cx, formatPoints } from '@/lib/format';

interface Config {
  hoursWeight: number;
  activityWeight: number;
  targetHours: number;
  hoursCap: number;
  maxPoints: number;
  bonusPersonalBest: number;
  bonusTargetMet: number;
  bonusHighActivity: number;
  highActivityThreshold: number;
  minHoursToQualify: number;
  integrityFlagActivity: number;
}

export default function ScoringPage() {
  const { user } = useAuth();
  const departments = useApi<any>('/api/departments');
  const [departmentId, setDepartmentId] = useState<string>('');

  const scoring = useApi<any>(departmentId ? `/api/settings/scoring?departmentId=${departmentId}` : '/api/settings/scoring', {
    deps: [departmentId],
  });

  const [cfg, setCfg] = useState<Config | null>(null);
  const [retro, setRetro] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null);

  useEffect(() => {
    if (!departmentId && user?.department?.id && user.role !== 'ADMIN') setDepartmentId(user.department.id);
  }, [user, departmentId]);

  useEffect(() => {
    if (scoring.data?.effective) setCfg({ ...scoring.data.effective });
  }, [scoring.data]);

  // Live preview against a realistic spread of a department's week.
  const sample = useMemo(
    () => [
      { name: 'Consistent high activity', hours: 32.75, activityPct: 100 },
      { name: 'Strong all round', hours: 33.5, activityPct: 97 },
      { name: 'Longest hours', hours: 36.5, activityPct: 66 },
      { name: 'Solid middle', hours: 33.3, activityPct: 82 },
      { name: 'Average', hours: 33.1, activityPct: 65 },
      { name: 'Low activity, full hours', hours: 33.1, activityPct: 50 },
      { name: 'Part week', hours: 18.0, activityPct: 78 },
      { name: 'On leave', hours: 4.0, activityPct: 60 },
    ],
    [],
  );

  const preview = useMemo(() => {
    if (!cfg) return [];
    const rows = sample.map((r) => {
      const ratio = r.hours / cfg.targetHours;
      const hoursScore = Math.max(0, Math.min(ratio, cfg.hoursCap) / cfg.hoursCap);
      const activityScore = Math.max(0, Math.min(1, r.activityPct / 100));
      const base = cfg.maxPoints * (cfg.hoursWeight * hoursScore + cfg.activityWeight * activityScore);
      const qualified = r.hours >= cfg.minHoursToQualify;
      let bonus = 0;
      if (qualified) {
        if (ratio >= 1) bonus += cfg.bonusTargetMet;
        if (r.activityPct >= cfg.highActivityThreshold) bonus += cfg.bonusHighActivity;
      }
      return { ...r, points: Math.round((base + bonus) * 100) / 100, qualified, hoursScore, activityScore };
    });
    return rows
      .sort((a, b) => (a.qualified === b.qualified ? b.points - a.points : a.qualified ? -1 : 1))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }, [cfg, sample]);

  function setWeight(hours: number) {
    if (!cfg) return;
    const h = Math.max(0, Math.min(1, Math.round(hours * 100) / 100));
    setCfg({ ...cfg, hoursWeight: h, activityWeight: Math.round((1 - h) * 100) / 100 });
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await api<any>('/api/settings/scoring', {
        method: 'PUT',
        body: { ...cfg, departmentId: departmentId || null, applyRetroactively: retro },
      });
      setMsg({
        tone: 'good',
        text: retro
          ? `Saved. ${res.recalculated} existing week${res.recalculated === 1 ? '' : 's'} re-scored with the new settings.`
          : 'Saved. New settings apply to weeks imported from now on.',
      });
      scoring.refresh();
    } catch (e) {
      setMsg({ tone: 'critical', text: e instanceof ApiError ? e.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  if (scoring.loading || !cfg) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-black tracking-tight text-ink">Scoring</h1>
          <p className="mt-1 text-[13.5px] text-ink-3">
            Change the weights and watch the sample table on the right re-rank instantly.
          </p>
        </div>
        {user?.role === 'ADMIN' && (
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-[240px]">
            <option value="">Company-wide default</option>
            {(departments.data?.departments ?? []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {msg && (
        <Notice tone={msg.tone} className="mb-5" onDismiss={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      {scoring.data?.usingGlobalFallback && (
        <Notice tone="info" className="mb-5">
          This department currently uses the company-wide default. Saving here creates settings just for it.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Controls */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-1 text-[15px] font-bold text-ink">The balance</h2>
            <p className="mb-4 text-[12.5px] leading-relaxed text-ink-3">
              These two always add up to 100%. Drag towards whichever matters more to your department.
            </p>

            <div className="mb-2 flex items-baseline justify-between text-[13px]">
              <span className="font-semibold text-ink">Hours {Math.round(cfg.hoursWeight * 100)}%</span>
              <span className="font-semibold text-ink">{Math.round(cfg.activityWeight * 100)}% Activity</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(cfg.hoursWeight * 100)}
              onChange={(e) => setWeight(Number(e.target.value) / 100)}
              className="w-full accent-s1"
              aria-label="Balance between hours and activity"
            />
            <div className="mt-1 flex justify-between text-[11px] text-ink-3">
              <span>All activity</span>
              <span>Even split</span>
              <span>All hours</span>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-bold text-ink">Targets</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Weekly target hours" hint="What a full week looks like for this department.">
                <Input
                  type="number"
                  step="0.5"
                  min="1"
                  value={cfg.targetHours}
                  onChange={(e) => setCfg({ ...cfg, targetHours: Number(e.target.value) })}
                />
              </Field>
              <Field label="Hours cap" hint={`Full credit at ${cfg.hoursCap}× target (${(cfg.targetHours * cfg.hoursCap).toFixed(1)}h). Stops long hours buying the top spot.`}>
                <Input
                  type="number"
                  step="0.05"
                  min="1"
                  max="3"
                  value={cfg.hoursCap}
                  onChange={(e) => setCfg({ ...cfg, hoursCap: Number(e.target.value) })}
                />
              </Field>
              <Field label="Points available" hint="Before bonuses. 1000 keeps the numbers readable.">
                <Input
                  type="number"
                  step="50"
                  min="10"
                  value={cfg.maxPoints}
                  onChange={(e) => setCfg({ ...cfg, maxPoints: Number(e.target.value) })}
                />
              </Field>
              <Field label="Qualifying hours" hint="Below this, someone is shown as unranked rather than last — protects annual leave and part-time.">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={cfg.minHoursToQualify}
                  onChange={(e) => setCfg({ ...cfg, minHoursToQualify: Number(e.target.value) })}
                />
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-[15px] font-bold text-ink">Bonuses</h2>
            <p className="mb-4 text-[12.5px] text-ink-3">Set any to 0 to switch it off.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hit the target">
                <Input
                  type="number"
                  min="0"
                  value={cfg.bonusTargetMet}
                  onChange={(e) => setCfg({ ...cfg, bonusTargetMet: Number(e.target.value) })}
                />
              </Field>
              <Field label="New personal best">
                <Input
                  type="number"
                  min="0"
                  value={cfg.bonusPersonalBest}
                  onChange={(e) => setCfg({ ...cfg, bonusPersonalBest: Number(e.target.value) })}
                />
              </Field>
              <Field label="High activity bonus">
                <Input
                  type="number"
                  min="0"
                  value={cfg.bonusHighActivity}
                  onChange={(e) => setCfg({ ...cfg, bonusHighActivity: Number(e.target.value) })}
                />
              </Field>
              <Field label="High activity starts at (%)">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={cfg.highActivityThreshold}
                  onChange={(e) => setCfg({ ...cfg, highActivityThreshold: Number(e.target.value) })}
                />
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-[15px] font-bold text-ink">Integrity flag</h2>
            <p className="mb-4 text-[12.5px] leading-relaxed text-ink-3">
              Activity at or above this is flagged for your eyes only on the week detail screen. It is a prompt to look,
              not an accusation — genuinely input-heavy work can sit very high.
            </p>
            <Field label="Flag activity at or above (%)" className="max-w-[200px]">
              <Input
                type="number"
                min="50"
                max="100"
                value={cfg.integrityFlagActivity}
                onChange={(e) => setCfg({ ...cfg, integrityFlagActivity: Number(e.target.value) })}
              />
            </Field>
          </Card>

          <Card className="p-5">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" checked={retro} onChange={(e) => setRetro(e.target.checked)} className="mt-0.5 accent-s1" />
              <span>
                <span className="block text-[13.5px] font-semibold text-ink">Apply to weeks already published</span>
                <span className="block text-[12px] leading-relaxed text-ink-3">
                  Re-scores history with the new settings. Positions people already celebrated may change — leave this
                  off unless you are correcting a genuine mistake.
                </span>
              </span>
            </label>

            <div className="mt-4 flex gap-2">
              <Button onClick={save} loading={saving} icon={<Save size={15} />}>
                Save settings
              </Button>
              <Button
                variant="ghost"
                icon={<RotateCcw size={15} />}
                onClick={() => setCfg({ ...scoring.data.defaults })}
              >
                Reset to defaults
              </Button>
            </div>
          </Card>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden">
            <div className="border-b border-hairline px-5 py-3.5">
              <h2 className="text-[15px] font-bold text-ink">Live preview</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                A realistic spread of one week, scored with your current settings.
              </p>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="px-4 py-2.5 label">#</th>
                  <th className="px-2 py-2.5 label">Profile</th>
                  <th className="px-2 py-2.5 label text-right">Hrs</th>
                  <th className="px-2 py-2.5 label text-right">Act</th>
                  <th className="px-4 py-2.5 label text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr
                    key={r.name}
                    className={cx('border-b border-hairline/60 last:border-0', !r.qualified && 'opacity-50')}
                  >
                    <td className="px-4 py-2.5 font-bold text-ink-3 tnum">{r.qualified ? r.rank : '–'}</td>
                    <td className="px-2 py-2.5 text-ink-2">{r.name}</td>
                    <td className="px-2 py-2.5 text-right text-ink-3 tnum">{r.hours}</td>
                    <td className="px-2 py-2.5 text-right text-ink-3 tnum">{r.activityPct}%</td>
                    <td className="px-4 py-2.5 text-right font-bold text-ink tnum">{formatPoints(r.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-hairline px-5 py-3">
              <p className="flex gap-2 text-[11.5px] leading-relaxed text-ink-3">
                <Info size={12} className="mt-0.5 shrink-0" />
                Watch what happens if you push the balance all the way to hours: &ldquo;Longest hours&rdquo; climbs to the
                top despite the lowest activity of anyone working a full week. That is the trade-off you are choosing.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
