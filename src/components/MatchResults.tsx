import TripCard from './TripCard';
import type { TripMatch } from '@/lib/matching';

export default function MatchResults({ matches }: { matches: TripMatch[] }) {
  return matches.length ? <div className="cards">{matches.map(match => <div key={match.trip.id}>
    <TripCard trip={match.trip}/>
    <div className="notice"><strong>匹配分数 {match.score} / 100</strong><ul>{match.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>
  </div>)}</div> : <div className="panel empty"><h2>暂时没有合适的模拟行程</h2><p>试试调整地点、日期、出发时间或人数，也可以保留当前计划。</p></div>;
}
