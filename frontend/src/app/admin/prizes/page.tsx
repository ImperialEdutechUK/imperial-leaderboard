'use client';

import { useEffect, useState } from 'react';
import { Crown, Gift, Trash2, Trophy } from 'lucide-react';
import { api, ApiError, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, EmptyState, Field, Input, Notice, Select, Skeleton } from '@/components/ui';
import { Avatar, RankBadge } from '@/components/bits';
import { formatPoints } from '@/lib/format';

export default function PrizesPage() {
  const { user } = useAuth();
  const departments = useApi<any>('/api/departments');
  const [departmentId, setDepartmentId] = useState('');
  const [month, setMonth] = useState('');

  useEffect(() => {
    if (!departmentId) {
      const first = user?.department?.id ?? departments.data?.departments?.[0]?.id;
      if (first) setDepartmentId(first);
    }
  }, [user, departments.data, departmentId]);

  const candidates = useApi<any>(
    departmentId ? `/api/prizes/candidates?departmentId=${departmentId}${month ? `&month=${month}` : ''}` : null,
    { deps: [departmentId, month] },
  );
  const prizes = useApi<any>('/api/prizes');

  const [winner, setWinner] = useState('');
  const [reward, setReward] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null);

  const standings = candidates.data?.standings ?? [];
  const suggested = standings[0];
  const existing = candidates.data?.existingPrize;

  useEffect(() => {
    setWinner(existing?.employeeId ?? suggested?.employee?.id ?? '');
    setReward(existing?.reward ?? '');
  }, [existing, suggested]);

  async function award() {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/prizes', {
        method: 'POST',
        body: {
          departmentId,
          periodType: 'MONTH',
          periodKey: candidates.data.monthKey,
          employeeId: winner,
          reward: reward || null,
        },
      });
      setMsg({ tone: 'good', text: 'Champion confirmed. They now appear in the Hall of Fame.' });
      candidates.refresh();
      prizes.refresh();
    } catch (e) {
      setMsg({ tone: 'critical', text: e instanceof ApiError ? e.message : 'Could not award the prize.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-[24px] font-black tracking-tight text-ink">Prizes</h1>
        <p className="mt-1 text-[13.5px] text-ink-3">
          Confirm each month&rsquo;s champion. Nothing is awarded automatically — a person always makes the call.
        </p>
      </div>

      {msg && (
        <Notice tone={msg.tone} className="mb-5" onDismiss={() => setMsg(null)}>
          {msg.text}
        </Notice>
      )}

      <div className="mb-5 flex flex-wrap gap-3">
        {user?.role === 'ADMIN' && (
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-[230px]">
            {(departments.data?.departments ?? []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        {(candidates.data?.months?.length ?? 0) > 0 && (
          <Select value={month || candidates.data?.monthKey || ''} onChange={(e) => setMonth(e.target.value)} className="w-[180px]">
            {candidates.data.months.map((m: any) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      {candidates.loading ? (
        <Skeleton className="h-[380px]" />
      ) : standings.length === 0 ? (
        <EmptyState icon={<Trophy size={28} />} title="No published weeks for this month">
          Publish at least one week before crowning a champion.
        </EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Card className="overflow-hidden">
            <div className="border-b border-hairline px-5 py-3.5">
              <h2 className="text-[15px] font-bold text-ink">{candidates.data.monthName} standings</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-3 tnum">
                {candidates.data.weeks.length} {candidates.data.weeks.length === 1 ? 'week' : 'weeks'} counted
              </p>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-hairline text-left">
                  <th className="px-4 py-2.5 label">#</th>
                  <th className="px-2 py-2.5 label">Person</th>
                  <th className="px-2 py-2.5 label text-right">Wks</th>
                  <th className="px-2 py-2.5 label text-right">Wins</th>
                  <th className="px-4 py-2.5 label text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s: any) => (
                  <tr
                    key={s.employee.id}
                    className={`cursor-pointer border-b border-hairline-strong last:border-0 hover:bg-ink/[0.03] ${
                      winner === s.employee.id ? 'bg-gold/[0.07]' : ''
                    }`}
                    onClick={() => setWinner(s.employee.id)}
                  >
                    <td className="px-4 py-2.5">
                      <RankBadge rank={s.rank} size={26} />
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={s.employee.name} initials={s.employee.initials} colour={s.employee.colour} size={26} />
                        <span className="font-semibold text-ink">{s.employee.name}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right text-ink-2 tnum">{s.weeksCounted}</td>
                    <td className="px-2 py-2.5 text-right tnum">
                      {s.wins > 0 ? <span className="font-bold text-gold">{s.wins}</span> : <span className="text-ink-3">0</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-ink tnum">{formatPoints(s.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-ink">
                <Crown size={16} className="text-gold" /> Crown the champion
              </h2>
              <p className="mb-4 text-[12.5px] leading-relaxed text-ink-3">
                {existing ? 'This month already has a champion. Saving replaces them.' : 'Pick anyone — the leader is pre-selected but the choice is yours.'}
              </p>

              <div className="space-y-4">
                <Field label="Champion">
                  <Select value={winner} onChange={(e) => setWinner(e.target.value)}>
                    {standings.map((s: any) => (
                      <option key={s.employee.id} value={s.employee.id}>
                        #{s.rank} · {s.employee.name} · {formatPoints(s.points)} pts
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Prize" hint="Free text — shown publicly on the Hall of Fame.">
                  <Input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="£50 voucher" />
                </Field>

                <Button onClick={award} loading={busy} variant="gold" className="w-full" icon={<Gift size={15} />} disabled={!winner}>
                  {existing ? 'Update champion' : 'Confirm champion'}
                </Button>
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 text-[15px] font-bold text-ink">Awarded so far</h2>
              {(prizes.data?.prizes ?? []).length === 0 ? (
                <p className="text-[12.5px] text-ink-3">No prizes awarded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {(prizes.data?.prizes ?? []).map((p: any) => (
                    <li key={p.id} className="flex items-center gap-2.5 rounded-xl border border-hairline p-2.5">
                      {p.employee && <Avatar name={p.employee.fullName} colour={p.employee.avatarColour} size={26} />}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold text-ink">{p.employee?.fullName ?? '—'}</div>
                        <div className="truncate text-[11px] text-ink-3">
                          {p.title}
                          {p.reward ? ` · ${p.reward}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await api(`/api/prizes/${p.id}`, { method: 'DELETE' });
                          prizes.refresh();
                          candidates.refresh();
                        }}
                        className="shrink-0 text-ink-3 hover:text-critical"
                        aria-label="Remove prize"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
