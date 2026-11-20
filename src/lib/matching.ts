import type { Trip } from './trips';

export type MatchRequest = { id?: string; from?: string; to?: string; date?: string; time?: string; flexibility?: number; traveling?: number };
export type TripMatch = { trip: Trip; score: number; reasons: string[] };

const groups = [
  ['davis', '戴维斯', '戴维斯市', 'uc davis', 'ucd', '加州大学戴维斯分校'],
  ['sfo', '旧金山机场', '旧金山国际机场', 'san francisco international airport'],
  ['smf', '萨克拉门托机场', 'sacramento 国际机场', '萨克拉门托国际机场', 'sacramento international airport'],
  ['sacramento', '萨克拉门托'],
  ['旧金山', 'san francisco'],
];
const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
function place(text: string) {
  const normalized = normalize(text);
  return groups.findIndex(aliases => aliases.some(alias => normalized === alias || normalized.startsWith(`${alias} ·`) || normalized.startsWith(`${alias} `) || normalized.endsWith(` ${alias}`)));
}
function placeScore(a: string, b: string): number {
  if (normalize(a) === normalize(b)) return 30;
  // Airport aliases are checked before city aliases; SFO is not downtown SF.
  const left = place(a), right = place(b);
  return left >= 0 && left === right ? 25 : 0;
}
function minutes(time: string): number {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : NaN;
}
function validDate(date: string): boolean {
  const parsed = new Date(`${date}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}
export function pacificNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}
export function matchTrips(request: MatchRequest, candidates: Trip[], now = new Date()): TripMatch[] {
  const current = pacificNow(now), people = request.traveling ?? 1;
  const flexibility = request.flexibility ?? 30;
  if (!Number.isInteger(people) || people < 1 || people > 6 || ![15, 30, 60].includes(flexibility)) return [];
  if (request.date && (!validDate(request.date) || request.date < current.date)) return [];
  if (request.time && (!request.date || !Number.isFinite(minutes(request.time)))) return [];
  return candidates.flatMap((trip): TripMatch[] => {
    const departure = minutes(trip.time);
    if (trip.id === request.id || trip.status !== 'active' || !validDate(trip.date) || !Number.isFinite(departure) || ![15, 30, 60].includes(trip.flexibility) || !Number.isInteger(trip.availableSeats) || trip.availableSeats < people) return [];
    if (trip.date < current.date || (trip.date === current.date && departure <= current.minute)) return [];
    if (request.date && trip.date !== request.date) return [];
    let points = 5, maximum = 5;
    const reasons: string[] = [];
    for (const [label, requested, actual] of [['出发地', request.from, trip.from], ['目的地', request.to, trip.to]]) {
      if (!requested?.trim()) continue;
      const score = placeScore(requested, actual!);
      if (!score) return [];
      points += score; maximum += 30;
      reasons.push(`${label}${score === 30 ? '相同' : '位于同一城市或机场，集合地点需协商'}`);
    }
    if (request.date) { points += 20; maximum += 20; reasons.push('出发日期相同'); }
    if (request.time) {
      const target = minutes(request.time);
      const start = Math.max(0, departure - trip.flexibility, target - flexibility, trip.date === current.date ? current.minute + 1 : 0);
      const end = Math.min(1439, departure + trip.flexibility, target + flexibility);
      if (start > end) return [];
      const difference = Math.abs(departure - target);
      points += 15 * (1 - difference / (trip.flexibility + flexibility)); maximum += 15;
      reasons.push(`计划出发时间相差 ${difference} 分钟，双方弹性时间有重叠`);
    }
    reasons.push(`剩余 ${trip.availableSeats} 个名额，可容纳你们 ${people} 人`);
    return [{ trip, score: Math.round(points / maximum * 100), reasons }];
  }).sort((a, b) => b.score - a.score || a.trip.date.localeCompare(b.trip.date) || a.trip.time.localeCompare(b.trip.time) || a.trip.id.localeCompare(b.trip.id));
}
