import Link from 'next/link';
import { type Trip, formatDate } from '@/lib/trips';
export default function TripCard({ trip }: { trip: Trip }) {
 return <article className="trip-card"><div className="row"><span className="tag">{trip.category}</span><span className="muted">{formatDate(trip.date)}</span></div><div className="route"><div><i className="dot"/>{trip.from}</div><div><i className="dot filled"/>{trip.to}</div></div><div className="trip-meta"><span>◷ {trip.time} 出发</span><span>♧ 寻找 {trip.seats} 位同行</span></div><div className="card-bottom"><span className="person"><span className="avatar">{trip.name.slice(0,1)}</span>{trip.name}</span><Link href={`/trips/${trip.id}`} className="text-link" aria-label={`查看${trip.from}至${trip.to}的行程`}>查看行程 ↗</Link></div></article>;
}
