import Link from 'next/link';
import SearchForm from '@/components/SearchForm';
import MatchResults from '@/components/MatchResults';
import { trips } from '@/lib/trips';
import { matchTrips } from '@/lib/matching';
export default async function Trips({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const params = await searchParams;
 const value=(key:string)=>typeof params[key]==='string'?params[key] as string:'';
 const from=value('from'),to=value('to'),date=value('date'),time=value('time'),flexibility=value('flexibility'),traveling=value('traveling');
 const matches=matchTrips({from,to,date,time,flexibility:flexibility ? Number(flexibility) : 30,traveling:traveling ? Number(traveling) : 1},trips);
 const invalid = (time && !date) || (flexibility && ![15,30,60].includes(Number(flexibility))) || (traveling && (!Number.isInteger(Number(traveling)) || Number(traveling)<1 || Number(traveling)>6));
 return <section className="shell page"><div className="eyebrow">GOING THE SAME WAY</div><h1 className="page-title">寻找你的同路人</h1><p className="muted">全部结果均为模拟数据。按已填写的条件匹配；补充地点、日期和时间，推荐更准确。日期与时间均为加州时间。</p><SearchForm defaults={{from,to,date,time,flexibility,traveling}}/>{invalid&&<p className="error" role="alert">请检查筛选条件：选择时间时需填写日期，时间弹性为 ±15、±30 或 ±60 分钟，人数为 1 至 6 位。</p>}<div className="section-heading"><h2>推荐同行 <span className="count">{matches.length}</span></h2><Link href="/trips" className="text-link">清除筛选</Link></div><p className="muted">分数表示与已填写条件的符合程度，未填写条件不计分；不代表预订成功。集合地点、车辆与行李空间需另行协商。</p><MatchResults matches={matches}/><p><Link className="text-link" href="/trips/new">创建行程预览 ＋</Link></p></section>;
}
