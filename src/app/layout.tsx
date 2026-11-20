import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata = { title: 'Davis Carpool · 同路，一起出发', description: '为 UC Davis 中国留学生打造的拼车信息协调平台。第一阶段模拟演示。' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><header><nav className="shell nav" aria-label="主导航"><Link href="/" className="brand"><span className="brand-icon">↗</span>Davis Carpool<span className="beta">BETA</span></Link><div className="navlinks"><Link href="/trips">寻找同行</Link><Link href="/dashboard">我的行程</Link><Link href="/trips/new" className="button small">发布行程 <span>＋</span></Link></div></nav></header><main>{children}</main><footer className="shell"><div><strong>Davis Carpool</strong><p>让每一次出发，都有同路的人。</p></div><p>学生自发协调 · 不提供运输服务或处理支付<br/>阶段一演示 · 全部行程为模拟数据 · 非 UC Davis 官方平台</p></footer></body></html>;
}
