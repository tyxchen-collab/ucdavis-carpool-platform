import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTrips, pacificNow } from '../src/lib/matching.ts';
import { trips } from '../src/lib/trips.ts';

const now = new Date('2026-11-01T18:00:00Z');
const trip = { id: 'a', from: 'Davis', to: 'SFO', date: '2026-11-20', time: '09:00', flexibility: 30, traveling: 1, availableSeats: 2, status: 'active', seats: 2, name: '测试', note: '', category: '模拟' };
const request = { from: 'Davis', to: 'SFO', date: '2026-11-20', time: '09:00', flexibility: 30, traveling: 2 };
const match = (changes = {}, query = request) => matchTrips(query, [{ ...trip, ...changes }], now);

test('exact route, date, time and capacity score 100 with Chinese explanations', () => {
  const [result] = match();
  assert.equal(result.score, 100);
  assert.equal(result.reasons.length, 5);
  assert.ok(result.reasons.some(reason => reason.includes('可容纳你们 2 人')));
});
test('case, spaces, Chinese and airport aliases match with lower location score', () => {
  assert.equal(match({}, { ...request, from: '  DAVIS ', to: ' sfo ' })[0].score, 100);
  assert.ok(match({ from: 'Davis · UC Davis 校园', to: '旧金山国际机场 SFO' }).length);
  assert.ok(match({ from: '戴维斯', to: 'san francisco international airport' })[0].score < 100);
});
test('different origins, destinations, airport versus city, dates and reversed routes are excluded', () => {
  for (const changes of [{ from: 'Sacramento' }, { to: 'SMF' }, { to: '旧金山 · Union Square' }, { date: '2026-11-21' }, { from: 'SFO', to: 'Davis' }, { from: 'NotDavis' }]) assert.deepEqual(match(changes), []);
});
test('both time flexibilities contribute to inclusive overlap', () => {
  assert.equal(match({ time: '10:00' }).length, 1);
  assert.equal(match({ time: '10:01' }).length, 0);
  assert.equal(match({ time: '10:15', flexibility: 60 }, { ...request, flexibility: 15 }).length, 1);
  assert.equal(match({ time: '10:16', flexibility: 60 }, { ...request, flexibility: 15 }).length, 0);
});
test('full, cancelled, past, self and insufficient-capacity trips are excluded', () => {
  for (const changes of [{ status: 'cancelled' }, { availableSeats: 0 }, { availableSeats: 1 }, { availableSeats: 1.5 }, { date: '2020-01-01' }, { id: 'self' }]) assert.deepEqual(match(changes, { ...request, id: 'self' }), []);
});
test('same-day departures use California time, including DST transition', () => {
  assert.deepEqual(pacificNow(now), { date: '2026-11-01', minute: 600 });
  const query = { ...request, date: '2026-11-01', time: '10:30' };
  assert.deepEqual(match({ date: query.date, time: '10:00' }, query), []);
  assert.equal(match({ date: query.date, time: '10:01' }, query).length, 1);
  assert.equal(pacificNow(new Date('2026-07-01T06:00:00Z')).date, '2026-06-30');
});
test('invalid inputs and malformed candidates fail closed', () => {
  for (const patch of [{ traveling: 0 }, { traveling: 1.5 }, { traveling: NaN }, { flexibility: 20 }, { date: '2026-02-30' }, { date: '2020-01-01' }, { time: '25:00' }, { date: '', time: '09:00' }]) assert.deepEqual(match({}, { ...request, ...patch }), []);
  for (const patch of [{ date: '2026-02-30' }, { time: 'bad' }, { flexibility: 0 }, { availableSeats: NaN }]) assert.deepEqual(match(patch), []);
});
test('ranking is descending, bounded and deterministic on ties', () => {
  const candidates = [{ ...trip, id: 'later', time: '09:30' }, { ...trip, id: 'b' }, { ...trip, id: 'a' }, { ...trip, id: 'edge', time: '10:00' }];
  const results = matchTrips(request, candidates, now);
  assert.deepEqual(results.map(result => result.trip.id), ['a', 'b', 'later', 'edge']);
  assert.ok(results.every(result => Number.isInteger(result.score) && result.score >= 0 && result.score <= 100));
});
test('partial browsing excludes unavailable trips and supports capacity filters', () => {
  assert.deepEqual(matchTrips({ traveling: 3 }, [trip], now), []);
  assert.equal(matchTrips({}, [trip, { ...trip, status: 'cancelled' }], now).length, 1);
  assert.equal(matchTrips({ to: 'SFO' }, [trip, { ...trip, to: 'SMF' }], now).length, 1);
});
test('real mock data offers multiple recommendations while filtering invalid statuses', () => {
  const results = matchTrips({ ...request, traveling: 1 }, trips, now);
  assert.deepEqual(new Set(results.map(result => result.trip.id)), new Set(['1', '5']));
});
test('windows do not wrap to another departure date', () => {
  assert.deepEqual(match({ time: '23:45', flexibility: 60 }, { ...request, time: '00:15', flexibility: 60 }), []);
});

const november15Request = { from: 'Davis', to: 'SFO Airport', date: '2026-11-15', time: '10:00', flexibility: 30, traveling: 1, seats: 2 };

test('November 15 user preview recommends only the compatible TEST trip, with Chinese reasons', () => {
  const results = matchTrips(november15Request, trips, now);
  assert.deepEqual(results.map(result => result.trip.id), ['test-20261115-compatible']);
  const [result] = results;
  assert.equal(result.score, 91);
  assert.equal(result.trip.availableSeats, 2);
  assert.ok(result.trip.category.includes('TEST'));
  assert.ok(result.reasons.includes('出发日期相同'));
  assert.ok(result.reasons.includes('计划出发时间相差 15 分钟，双方弹性时间有重叠'));
  assert.ok(result.reasons.includes('剩余 2 个名额，可容纳你们 1 人'));
});

test('incompatible TEST trip is excluded specifically by time, not route, date or capacity', () => {
  const candidate = trips.find(item => item.id === 'test-20261115-incompatible');
  assert.ok(candidate);
  assert.ok(candidate.category.includes('TEST'));
  assert.deepEqual(matchTrips(november15Request, [candidate], now), []);
  const results = matchTrips({ ...november15Request, time: '12:00' }, [candidate], now);
  assert.equal(results.length, 1);
  assert.equal(results[0].trip.id, candidate.id);
});
