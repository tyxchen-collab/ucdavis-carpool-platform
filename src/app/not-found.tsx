import Link from 'next/link';
export default function NotFound(){return <section className="shell page empty"><h1>这段行程暂时找不到</h1><p>链接可能有误，去看看其他模拟行程吧。</p><Link href="/trips" className="button">返回行程列表</Link></section>}
