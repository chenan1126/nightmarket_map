import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { MapPin, LocateFixed, Search, Plus, Database, ArrowRight, X, Check, Info, LogIn, LogOut, Send, Star, LoaderCircle, ExternalLink, ShieldCheck, Flag } from 'lucide-react';
import { supabase, supabaseConfigured, turnstileSiteKey } from './lib/supabaseClient';
import TurnstileWidget from './components/TurnstileWidget';
import './moderation.css';

const LazyMarketMap = lazy(() => import('./components/LazyMarketMap'));
const PROTOTYPE_STALLS = [
  { id: 'prototype-1', name: '陳董藥燉排骨', city: '臺北市', district: '松山區', type: '主食', emoji: '🍲', note: '饒河街原型攤位資料', address: '饒河街觀光夜市', source: 'prototype seed data' },
  { id: 'prototype-2', name: '福州世祖胡椒餅', city: '臺北市', district: '松山區', type: '主食', emoji: '🥙', note: '饒河街原型攤位資料', address: '饒河街觀光夜市', source: 'prototype seed data' },
  { id: 'prototype-3', name: '阿國滷味', city: '臺北市', district: '松山區', type: '主食', emoji: '🍢', note: '饒河街原型攤位資料', address: '饒河街觀光夜市', source: 'prototype seed data' },
];

function distanceKm(from, item) {
  if (!from || item.latitude == null || item.longitude == null) return null;
  const [lat, lon] = from; const rad = Math.PI / 180; const a = Math.sin((item.latitude - lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(item.latitude * rad) * Math.sin((item.longitude - lon) * rad / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const isAnonymousUser = (user) => user?.is_anonymous === true || user?.user_metadata?.is_anonymous === true;
const proposalStatusLabel = { pending: '待確認', discussion: '討論中', needs_evidence: '待補資料', adopted: '已採用', rejected: '未採用' };
const qualityReportReasonLabel = { incorrect: '資料錯誤', duplicate: '疑似重複', relocated: '已搬遷', closed: '已停業', inappropriate: '不當內容' };
const formatRelativeTime = (value) => {
  if (!value) return '時間待確認';
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return '剛剛';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days} 天前` : '較早前';
};
const formatProposalKind = (kind) => kind === 'stall' ? '新增攤位' : '新增夜市';
const formatProposalSummary = (proposal) => proposal.payload?.note?.trim() || [proposal.payload?.city, proposal.payload?.district, proposal.payload?.address || proposal.payload?.location_note].filter(Boolean).join(' · ') || '等待社群補充資料';

class MapLoadBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return <div className="map-load-error" role="alert">地圖載入失敗，請稍後再試。</div>;
    return this.props.children;
  }
}

function AuthPanel({ user, authBusy, authMessage, email, setEmail, onSendMagicLink, onSignOut, authOpen, setAuthOpen }) {
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  if (!supabaseConfigured) return <div className="community-status offline"><Info size={16} /><span>社群功能尚未連線；目前只顯示唯讀名錄。設定 Supabase 環境變數後才會開放投稿、登入與評分。</span></div>;
  if (user && !isAnonymousUser(user)) return <div className="community-status online"><span><b>已登入會員</b><small>{user.email}</small></span><button className="text-button" onClick={onSignOut}><LogOut size={15} /> 登出</button></div>;
  const captchaMissing = !turnstileSiteKey;
  const submitMagicLink = (event) => { event.preventDefault(); if (captchaMissing) { setCaptchaError('登入需要啟用 Turnstile site key。'); return; } if (!captchaToken) { setCaptchaError('請先完成 Cloudflare 人機驗證。'); return; } onSendMagicLink({ event, captchaToken, onCaptchaReset: () => { setCaptchaToken(''); setCaptchaReset((value) => value + 1); } }); };
  return <div className={`community-status auth-form ${authOpen ? 'is-open' : ''}`}><div><b>{user ? '可免登入投稿' : '投稿可免登入；表決與星評需要登入'}</b><small>{user ? '目前是暫時投稿身分；表決和星評仍需會員登入。' : '使用 email magic link 登入，不會影響匿名投稿。'}</small></div>{!authOpen && <button className="text-button auth-expand" onClick={() => setAuthOpen(true)}><LogIn size={15} /> 登入參與表決</button>}{authOpen && <form onSubmit={submitMagicLink}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="你的 email" required />{captchaMissing ? <div className="inline-warning"><Info size={15} /> 登入需要 Turnstile site key。</div> : <TurnstileWidget siteKey={turnstileSiteKey} resetSignal={captchaReset} onToken={(token) => { setCaptchaToken(token); setCaptchaError(''); }} onError={setCaptchaError} />}<button className="text-button" disabled={authBusy || captchaMissing || !captchaToken}>{authBusy ? <LoaderCircle className="spin" size={15} /> : <LogIn size={15} />} 寄送登入連結</button><button type="button" className="auth-collapse" onClick={() => setAuthOpen(false)}>稍後再登入</button></form>}{captchaError && <small className="community-message">{captchaError}</small>}{authMessage && <small className="community-message">{authMessage}</small>}</div>;
}

function MyQualityReports({ user }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const permanentUser = user && !isAnonymousUser(user);
  const load = async () => {
    if (!supabase || !permanentUser) return;
    setLoading(true);
    const { data } = await supabase.from('quality_reports').select('id,stall_id,reason,description,status,decision_reason,submitted_at,stalls(name)').order('submitted_at', { ascending: false }).limit(20);
    setRows(data || []); setLoading(false);
  };
  useEffect(() => { if (open) load(); }, [open, permanentUser]);
  if (!permanentUser) return null;
  return <section className="my-reports"><button className="text-button" onClick={() => setOpen((value) => !value)}><Flag size={14} /> 我的資料回報 {open ? '收起' : '查看'}</button>{open && <div className="my-reports-list">{loading && <p className="form-hint">載入回報中…</p>}{!loading && !rows.length && <p className="form-hint">你目前沒有資料品質回報。</p>}{rows.map((row) => <article className="proposal-card" key={row.id}><div><b>{row.stalls?.name || '攤位'}</b><span className="proposal-status">{row.status}</span></div><p>{qualityReportReasonLabel[row.reason]}：{row.description}</p>{row.decision_reason && <p>處理說明：{row.decision_reason}</p>}</article>)}</div>}</section>;
}

function ContributionForm({ selected, user, marketDbId, busy, error, onSubmit, onClose }) {
  const [kind, setKind] = useState(selected ? 'stall' : 'market');
  const [name, setName] = useState('');
  const [cityName, setCityName] = useState(selected?.city || '');
  const [district, setDistrict] = useState(selected?.district || '');
  const [address, setAddress] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [note, setNote] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const permanentUser = user && !isAnonymousUser(user);
  const captchaMissing = !user && !turnstileSiteKey;
  const submit = (event) => { event.preventDefault(); onSubmit({ kind, name, cityName, district, address, locationNote, sourceUrl, sourceTitle, note, marketId: kind === 'stall' ? marketDbId : null, captchaToken, onCaptchaReset: () => { setCaptchaToken(''); setCaptchaReset((value) => value + 1); } }); };
  return <form className="contribution-form" onSubmit={submit}><div className="form-heading"><div><span className="section-label">新增提案</span><h3>{selected ? `補充「${selected.name}」` : '新增夜市'}</h3></div><button type="button" className="modal-close" onClick={onClose} aria-label="關閉"><X size={18} /></button></div>{error && <div className="inline-error form-error" role="alert" aria-live="assertive"><Info size={15} /> {error}</div>}<label>類型<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="market">新增夜市</option>{selected && <option value="stall">新增攤位</option>}</select></label>{kind === 'stall' && !marketDbId && <div className="inline-warning"><Info size={15} /> 此夜市尚未同步到共同資料庫，暫時無法提交攤位提案。</div>}<label>名稱<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} placeholder="例如：阿明蚵仔煎" /></label>{kind === 'market' && <><label>縣市<input value={cityName} onChange={(event) => setCityName(event.target.value)} required maxLength={100} placeholder="例如：桃園市" /></label><label>區域<input value={district} onChange={(event) => setDistrict(event.target.value)} required maxLength={100} placeholder="例如：中壢區" /></label><label>地址或明確位置描述<input value={address} onChange={(event) => setAddress(event.target.value)} required maxLength={500} placeholder="例如：中央西路與中美路附近" /></label></>}{kind === 'stall' && <label>位置描述<input value={locationNote} onChange={(event) => setLocationNote(event.target.value)} required maxLength={500} placeholder="例如：入口右側第三排" /></label>}<label>資料來源 URL <input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required placeholder="https://…" /></label><label>來源名稱（選填）<input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} maxLength={200} /></label><label>補充說明（選填）<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} /></label>{captchaMissing ? <div className="inline-warning"><Info size={15} /> 匿名投稿需要啟用人機驗證；目前尚未設定 Turnstile site key。</div> : !user && <><p className="form-hint">首次匿名投稿前，請先完成 Cloudflare 人機驗證。</p><TurnstileWidget siteKey={turnstileSiteKey} resetSignal={captchaReset} onToken={(token) => { setCaptchaToken(token); setCaptchaError(''); }} onError={setCaptchaError} />{captchaError && <div className="inline-error"><Info size={15} /> {captchaError}</div>}</>}<p className="form-hint">送出後會以「待確認」公開顯示，來源會和提案一起保存；不會直接加入正式地圖。</p><button className="modal-action" disabled={busy || captchaMissing || (!user && !captchaToken) || (kind === 'stall' && !marketDbId)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} 送出待確認提案</button></form>;
}

function QualityReportForm({ stall, user, busy, error, onSubmit, onClose }) {
  const [reason, setReason] = useState('incorrect');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const captchaMissing = !user && !turnstileSiteKey;
  const submit = (event) => { event.preventDefault(); onSubmit({ stallId: stall.id, reason, description, sourceUrl, captchaToken, onCaptchaReset: () => { setCaptchaToken(''); setCaptchaReset((value) => value + 1); } }); };
  return <form className="contribution-form quality-report-form" onSubmit={submit}><div className="form-heading"><div><span className="section-label">資料品質回報</span><h3>回報「{stall.name}」</h3></div><button type="button" className="modal-close" onClick={onClose} aria-label="關閉"><X size={18} /></button></div>{error && <div className="inline-error form-error" role="alert" aria-live="assertive"><Info size={15} /> {error}</div>}<label>回報類型<select value={reason} onChange={(event) => setReason(event.target.value)}>{Object.entries(qualityReportReasonLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>說明<textarea value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={2000} rows={4} placeholder="請描述你看到的狀況，以及建議如何修正" /></label><label>資料來源 URL<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required placeholder="https://…" /></label>{captchaMissing ? <div className="inline-warning"><Info size={15} /> 匿名回報需要啟用人機驗證；目前尚未設定 Turnstile site key。</div> : (!user && <div><p className="form-hint">首次匿名回報前，請先完成 Cloudflare 人機驗證。</p><TurnstileWidget siteKey={turnstileSiteKey} resetSignal={captchaReset} onToken={(token) => { setCaptchaToken(token); setCaptchaError(''); }} onError={setCaptchaError} />{captchaError && <div className="inline-error"><Info size={15} /> {captchaError}</div>}</div>)}<p className="form-hint">回報會先進入待處理狀態，來源與說明會保留供管理者核對。</p><button className="modal-action" disabled={busy || captchaMissing || (!user && !captchaToken)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} 送出回報</button></form>;
}

const MODERATION_STATUSES = ['pending', 'discussion', 'needs_evidence', 'adopted', 'rejected'];

const QUALITY_REPORT_STATUSES = ['pending', 'in_review', 'needs_evidence', 'confirmed', 'rejected'];

function QualityReportsAdmin({ allowed, busy, onModerate }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({});
  const load = async () => {
    if (!supabase || !allowed) return;
    setLoading(true); setError('');
    const { data, error: loadError } = await supabase.from('quality_reports')
      .select('id,stall_id,reason,description,source_url,status,decision_reason,submitted_at,stalls(name)')
      .in('status', ['pending', 'in_review', 'needs_evidence']).order('submitted_at', { ascending: true }).limit(100);
    if (loadError) setError(`回報載入失敗：${loadError.message}`);
    else { setRows(data || []); setDrafts(Object.fromEntries((data || []).map((row) => [row.id, row.decision_reason || '']))); }
    setLoading(false);
  };
  useEffect(() => { if (open) load(); }, [open, allowed]);
  if (!allowed) return null;
  const update = async (row) => {
    const status = row.nextStatus || row.status;
    if (['needs_evidence', 'confirmed', 'rejected'].includes(status) && !drafts[row.id]?.trim()) { setError('待補資料、已確認與未採用都需要填寫處理理由。'); return; }
    setError('');
    const result = await onModerate(row.id, status, drafts[row.id] || '');
    if (result?.error) setError(result.error); else await load();
  };
  return <section className="quality-admin"><button className="moderation-toggle" onClick={() => setOpen((value) => !value)}><Flag size={16} /> 資料品質回報 {open ? '收起' : '開啟'}<span>攤位</span></button>{open && <div className="moderation-content">{error && <div className="inline-error"><Info size={15} /> {error}</div>}{loading && <p className="form-hint">載入回報中…</p>}{!loading && !rows.length && <p className="form-hint">目前沒有待處理的資料品質回報。</p>}{rows.map((row) => <article className="moderation-card" key={row.id}><div className="moderation-card-title"><b>{row.stalls?.name || '未命名攤位'}</b><span>{qualityReportReasonLabel[row.reason]} · {row.status}</span></div><p>{row.description}</p><a href={row.source_url} target="_blank" rel="noreferrer">查看回報來源 <ExternalLink size={13} /></a><div className="moderation-controls"><label>狀態<select value={row.nextStatus || row.status} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, nextStatus: event.target.value } : item))}>{QUALITY_REPORT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><label>處理理由<textarea rows={2} value={drafts[row.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="確認或退回時請說明" /></label><button className="modal-action" disabled={busy} onClick={() => update(row)}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} 儲存回報處理</button></div></article>)}</div>}</section>;
}

function AdminPanel({ role, busy, onModerate, onQualityModerate }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState({});
  const allowed = role === 'moderator' || role === 'admin';
  const load = async () => {
    if (!supabase || !allowed) return;
    setLoading(true); setError('');
    const { data, error: loadError } = await supabase.from('proposals')
      .select('id,kind,payload,source_url,source_title,status,decision_reason,submitted_at,support_count,oppose_count,needs_evidence_count')
      .in('status', ['pending', 'discussion', 'needs_evidence'])
      .order('submitted_at', { ascending: true }).limit(100);
    if (loadError) setError(`提案載入失敗：${loadError.message}`);
    else { setRows(data || []); setDrafts(Object.fromEntries((data || []).map((row) => [row.id, row.decision_reason || '']))); }
    setLoading(false);
  };
  useEffect(() => { if (open) load(); }, [open, role]);
  if (!allowed) return null;
  const update = async (row) => {
    const status = row.nextStatus || row.status;
    if ((status === 'needs_evidence' || status === 'rejected') && !drafts[row.id]?.trim()) {
      setError('「待補資料」與「未採用」需要填寫處理理由。'); return;
    }
    setError('');
    const result = await onModerate(row.id, status, drafts[row.id] || '');
    if (result?.error) setError(result.error);
    else await load();
  };
  return <section className="moderation-panel">
    <button className="moderation-toggle" onClick={() => setOpen((value) => !value)}><ShieldCheck size={16} /> 管理審核 {open ? '收起' : '開啟'}<span>{role}</span></button>
    {open && <div className="moderation-content"><div className="moderation-heading"><div><span className="section-label">MODERATION</span><h2>待審提案</h2></div><button className="text-button" onClick={load} disabled={loading}>{loading ? <LoaderCircle className="spin" size={14} /> : '重新整理'}</button></div>{error && <div className="inline-error"><Info size={15} /> {error}</div>}{!loading && !rows.length && <p className="form-hint">目前沒有開放中的待審提案。</p>}{rows.map((row) => <article className="moderation-card" key={row.id}><div className="moderation-card-title"><b>{row.payload?.name || '未命名提案'}</b><span>{row.kind === 'stall' ? '攤位' : '夜市'} · {proposalStatusLabel[row.status]}</span></div><p>{[row.payload?.city, row.payload?.district, row.payload?.address || row.payload?.location_note].filter(Boolean).join(' · ')}</p><a href={row.source_url} target="_blank" rel="noreferrer">{row.source_title || row.source_url} <ExternalLink size={13} /></a><div className="vote-summary"><span>支持 {row.support_count || 0}</span><span>反對 {row.oppose_count || 0}</span><span>需補資料 {row.needs_evidence_count || 0}</span></div>{row.kind === 'market' && <p className="form-hint">新增夜市採用流程尚未開放，請先補證據或退回；不會自動建立市場。</p>}<div className="moderation-controls"><label>狀態<select value={row.nextStatus || row.status} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, nextStatus: event.target.value } : item))}>{MODERATION_STATUSES.filter((status) => row.kind !== 'market' || status !== 'adopted').map((status) => <option key={status} value={status}>{proposalStatusLabel[status]}</option>)}</select></label><label>處理理由<textarea rows={2} value={drafts[row.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="需要補資料或退回時請說明" /></label><button className="modal-action" disabled={busy} onClick={() => update(row)}>{busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} 儲存審核</button></div></article>)}</div>}
    <QualityReportsAdmin allowed={allowed} busy={busy} onModerate={onQualityModerate} />
  </section>;
}

function MarketCommunityFeed({
  proposals,
  ratingSummaries,
  communityBusy,
  proposalBusy,
  proposalError,
  user,
  voteOnProposal,
  rateStall,
  onRequireAuth,
  onReport,
}) {
  return (
    <section className="market-community-section">
      <div className="market-section-heading">
        <div><span className="section-label">社群動態</span><h2>這個夜市的提案</h2></div>
        <span className="result-count">{proposals.length} 筆</span>
      </div>
      {communityBusy && <div className="community-loading"><LoaderCircle className="spin" size={15} /> 載入社群資料…</div>}
      {proposalError && <div className="inline-error"><Info size={15} /> {proposalError}</div>}
      {!communityBusy && !proposals.length && <p className="community-empty"><span>✦</span> 目前還沒有提案，成為第一位補充攤位資料的人吧。</p>}
      {(!user || isAnonymousUser(user)) && <p className="auth-action-hint">想參與表決或留下星評？<button type="button" onClick={onRequireAuth}>登入參與表決</button></p>}
      <div className="feed-list">
        {proposals.map((proposal, index) => (
          <article className={`feed-row ${index === 0 ? 'feed-row-featured' : ''}`} key={proposal.id}>
            <div className="feed-meta"><span>在地貢獻者</span><time dateTime={proposal.submitted_at}>{formatRelativeTime(proposal.submitted_at)}</time><span className="feed-kind">{formatProposalKind(proposal.kind)}</span><span className="proposal-status">{proposalStatusLabel[proposal.status] || proposal.status}</span></div>
            <h3>{proposal.payload?.name || '未命名提案'}</h3>
            <p className="feed-summary">{formatProposalSummary(proposal)}</p>
            <a className="feed-source" href={proposal.source_url} target="_blank" rel="noreferrer"><span>來源</span>{proposal.source_title || proposal.source_url} <ExternalLink size={12} /></a>
            <div className="feed-vote-row">
              <div className="vote-summary"><span>支持 {proposal.support_count || 0}</span><span>反對 {proposal.oppose_count || 0}</span><span>需補證據 {proposal.needs_evidence_count || 0}</span></div>
              {proposal.status !== 'rejected' && proposal.status !== 'adopted' && <div className="proposal-votes"><button disabled={proposalBusy} onClick={() => (!user || isAnonymousUser(user)) ? onRequireAuth() : voteOnProposal(proposal.id, 'support')}>支持</button><button disabled={proposalBusy} onClick={() => (!user || isAnonymousUser(user)) ? onRequireAuth() : voteOnProposal(proposal.id, 'oppose')}>反對</button><button disabled={proposalBusy} onClick={() => (!user || isAnonymousUser(user)) ? onRequireAuth() : voteOnProposal(proposal.id, 'needs_evidence')}>需補證據</button></div>}
            </div>
            {proposal.status === 'adopted' && proposal.adopted_stall_id && <div className="adopted-rating"><span className="star-rating"><Star size={14} /> {ratingSummaries[proposal.adopted_stall_id] ? `${ratingSummaries[proposal.adopted_stall_id].average_stars} / 5（${ratingSummaries[proposal.adopted_stall_id].rating_count} 則）` : '尚無星評'}</span><span className="star-rating"><span className="rating-label">留下評分</span>{[1, 2, 3, 4, 5].map((stars) => <button className="star-choice" key={stars} disabled={proposalBusy} aria-label={`${stars} 星`} title={`${stars} 星`} onClick={() => (!user || isAnonymousUser(user)) ? onRequireAuth() : rateStall(proposal.adopted_stall_id, stars)}>★</button>)}</span><button className="report-button" onClick={() => onReport({ id: proposal.adopted_stall_id, name: proposal.payload?.name || '這個攤位' })}><Flag size={13} /> 回報資料</button></div>}
          </article>
        ))}
      </div>
    </section>
  );
}

function MarketPage({ market, proposals, ratingSummaries, communityBusy, proposalError, setProposalError, showContribution, setShowContribution, reportTarget, setReportTarget, user, proposalBusy, marketDbId, submitProposal, voteOnProposal, rateStall, submitQualityReport, onRefresh, onBack, authBusy, authMessage, email, setEmail, sendMagicLink, signOut, authOpen, setAuthOpen }) {
  const focusMarketAuth = () => { setAuthOpen(true); const details = document.querySelector('.market-auth-tools'); if (details) details.open = true; window.setTimeout(() => { details?.scrollIntoView({ behavior: 'smooth', block: 'center' }); details?.querySelector('input[type="email"]')?.focus(); }, 0); };
  const openMarketContribution = () => { setProposalError(''); setShowContribution(true); window.setTimeout(() => { const form = document.querySelector('.market-page .page-shell > .contribution-form'); form?.scrollIntoView({ behavior: 'smooth', block: 'center' }); form?.querySelector('input')?.focus(); }, 0); };
  const focusReport = (stall) => { setProposalError(''); setReportTarget(stall); window.setTimeout(() => document.querySelector('.quality-report-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); };
  return (
    <main className="market-page">
      <div className="page-shell">
        <a className="back-link" href="/" onClick={onBack}><ArrowRight size={15} className="back-icon" /> 返回夜市社群</a>
        <section className="market-identity">
          <div className="market-identity-copy"><span className="section-label">夜市入口</span><h1>{market.name}</h1><p>{market.city} · {market.district}</p><div className="market-identity-actions"><button className="modal-action" onClick={openMarketContribution}><Plus size={16} /> 新增攤位提案</button><button className="text-button" onClick={onRefresh}><ArrowRight size={15} /> 重新整理</button></div></div>
          <figure className="market-identity-art"><img src="/assets/night-market-hero.jpg" alt="夜市意象示意圖片" /><figcaption>夜市意象・示意圖片</figcaption></figure>
        </section>
        <section className="market-trust-strip"><div><span>地址／位置</span><b>{market.address || '地址待官方資料補充'}</b></div><div><span>資料狀態</span><b>{market.coordinateStatus === 'unverified' ? '座標尚未核對' : market.coordinatePrecision || '入口／商圈近似'}</b></div><div><span>資料來源</span><a href={market.sourceUrl || 'https://data.gov.tw/dataset/95760'} target="_blank" rel="noreferrer">{market.source || '政府資料快照'} <ExternalLink size={12} /></a></div></section>
        <details className="market-source-details"><summary>查看完整來源與座標說明</summary><div className="market-source-grid"><span>來源網址</span><a href={market.sourceUrl || 'https://data.gov.tw/dataset/95760'} target="_blank" rel="noreferrer">開啟資料來源 <ExternalLink size={12} /></a><span>座標狀態</span><b>{market.coordinateStatus === 'unverified' ? '尚未核對，不顯示精確距離' : market.coordinatePrecision || '入口／商圈近似'}</b>{market.coordinateSource && <><span>座標連結</span><a href={market.coordinateSource} target="_blank" rel="noreferrer">查看地圖來源 <ExternalLink size={12} /></a></>}</div></details>
        <details className="market-auth-tools"><summary>登入參與表決</summary><AuthPanel user={user} authBusy={authBusy} authMessage={authMessage} email={email} setEmail={setEmail} onSendMagicLink={sendMagicLink} onSignOut={signOut} authOpen={authOpen} setAuthOpen={setAuthOpen} /></details>
        {showContribution && <ContributionForm selected={market} user={user} marketDbId={marketDbId} busy={proposalBusy} error={proposalError} onSubmit={submitProposal} onClose={() => setShowContribution(false)} />}
        <MarketCommunityFeed proposals={proposals} ratingSummaries={ratingSummaries} communityBusy={communityBusy} proposalBusy={proposalBusy} proposalError={proposalError} user={user} voteOnProposal={voteOnProposal} rateStall={rateStall} onRequireAuth={focusMarketAuth} onReport={focusReport} />
        <section className="market-page-next"><span className="section-label">資料品質</span><h2>一起讓這個夜市更好逛</h2><p>已採用的攤位可以留下 1–5 星喜好評分；發現地址、店名或營業資訊需要更新，也可以送出資料回報。</p>{reportTarget && <QualityReportForm stall={reportTarget} user={user} busy={proposalBusy} error={proposalError} onSubmit={submitQualityReport} onClose={() => setReportTarget(null)} />}{!user && <p className="form-hint">登入後可表決與星評；投稿與資料回報依現有匿名流程處理。</p>}</section>
      </div>
    </main>
  );
}

function DiscoveryPanel({ query, setQuery, city, setCity, cities, locate, locating, setExploreAll, onCommunity, visible }) {
  const searchResults = visible.slice(0, 5);
  const hasSearch = query.trim().length > 0;
  const onLocate = () => { setCity('全部'); setQuery(''); locate(); };
  return <section className="discovery-panel" id="discovery"><h2>今晚去哪逛？</h2><div className="discovery-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋夜市名稱或地區" /></div><button className="locate-button" onClick={onLocate}><LocateFixed size={16} className={locating ? 'spin' : ''} /> {locating ? '定位中…' : '使用我的位置'}</button><label><span>選擇縣市</span><select value={city} onChange={(event) => setCity(event.target.value)}><option value="全部">全台</option>{cities.map((item) => <option key={item}>{item}</option>)}</select></label>{hasSearch && <div className="discovery-results" aria-live="polite">{searchResults.length ? searchResults.map((market) => <a key={market.id} href={"/markets/" + encodeURIComponent(market.id)}><span><b>{market.name}</b><small>{market.city} · {market.district}</small></span><ArrowRight size={15} /></a>) : <p>找不到符合的夜市，請試試其他名稱或地區。</p>}</div>}<nav className="discovery-shortcuts" aria-label="夜市探索捷徑"><button onClick={onLocate}><LocateFixed size={15} /> 我附近</button><button onClick={() => { setCity('桃園市'); setQuery(''); }}><MapPin size={15} /> 桃園試行</button><button onClick={() => { setCity('全部'); setQuery(''); setExploreAll(true); document.getElementById('registry-explorer')?.scrollIntoView({ behavior: 'smooth' }); }}><Database size={15} /> 全台夜市</button><button onClick={onCommunity}><Send size={15} /> 社群提案</button></nav></section>;
}

function ExploreMosaic({ pilotMarkets, visible, markets, cities, setExploreAll }) {
  const pilotIds = new Set(pilotMarkets.map((market) => market.id));
  const pool = [...pilotMarkets, ...visible.filter((market) => !pilotIds.has(market.id)), ...markets.filter((market) => !pilotIds.has(market.id) && !visible.some((item) => item.id === market.id))];
  const tiles = pool.slice(0, 5);
  const images = ['/featured-food.jpg', '/assets/night-market-friends.jpg', '/assets/night-market-hero.jpg', '/assets/night-market-banner-v2.jpg'];
  return <section className="explore-mosaic" id="explore-highlights"><div className="mosaic-heading"><div><span className="section-label">圖片導覽</span><h2>從熟悉的夜晚開始探索</h2><div className="mosaic-meta"><span>{markets.length} 筆夜市</span><span>{cities.length} 個縣市</span><span>{markets.filter((market) => market.latitude != null).length} 個可定位點位</span></div></div><p>圖片為夜市意象，不代表特定夜市實景。</p></div><div className="mosaic-grid">{tiles.map((market, index) => <a className={`explore-tile explore-tile-${index + 1}`} key={market.id} href={"/markets/" + encodeURIComponent(market.id)}><img src={images[index % images.length]} alt="夜市意象圖片" /><span className="explore-tile-scrim" /><span className="explore-tile-copy"><b>{market.name}</b><small>{market.city} · {market.district}</small></span></a>)}</div><button className="mosaic-more" onClick={() => { setExploreAll(true); document.getElementById("registry-explorer")?.scrollIntoView({ behavior: "smooth" }); }}>探索全台名錄 <ArrowRight size={14} /></button></section>;
}

function App() {
  const [data, setData] = useState(null); const [city, setCity] = useState('全部'); const [query, setQuery] = useState('');
  const [userLocation, setUserLocation] = useState(null); const [locating, setLocating] = useState(false); const [prototype, setPrototype] = useState(false); const [toast, setToast] = useState('');
  const [user, setUser] = useState(null); const [role, setRole] = useState(null); const [email, setEmail] = useState(''); const [authBusy, setAuthBusy] = useState(false); const [authMessage, setAuthMessage] = useState(''); const [authOpen, setAuthOpen] = useState(false);
  const [communityBusy, setCommunityBusy] = useState(false); const [showContribution, setShowContribution] = useState(false); const [reportTarget, setReportTarget] = useState(null); const [marketDbId, setMarketDbId] = useState(null); const [proposals, setProposals] = useState([]); const [marketProposals, setMarketProposals] = useState([]); const [ratingSummaries, setRatingSummaries] = useState({}); const [proposalBusy, setProposalBusy] = useState(false); const [proposalError, setProposalError] = useState('');
  const routePath = window.location.pathname.replace(/\/+$/, '') || '/';
  const routeExternalId = routePath.startsWith('/markets/') ? decodeURIComponent(routePath.slice('/markets/'.length)) : null;
  useEffect(() => { fetch('/data/night-markets.json').then((response) => response.json()).then(setData).catch(() => setToast('夜市資料載入失敗，請重新整理')); }, []);
  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data: sessionData }) => { if (active) setUser(sessionData.session?.user || null); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setUser(session?.user || null); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    let active = true;
    if (!supabase || !user || isAnonymousUser(user)) { setRole(null); return undefined; }
    supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle().then(({ data }) => { if (active) setRole(data?.role || 'member'); });
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    if (!supabase) return;
    supabase.from('proposals').select('id,payload,source_url,source_title,status,submitted_at,support_count,oppose_count,needs_evidence_count').eq('kind', 'market').is('market_id', null).order('submitted_at', { ascending: false }).limit(100).then(({ data, error }) => { if (!error) setMarketProposals((data || []).filter((proposal) => city === '全部' || proposal.payload?.city === city)); });
  }, [city]);
  const loadMarketProposals = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('proposals').select('id,payload,source_url,source_title,status,submitted_at,support_count,oppose_count,needs_evidence_count').eq('kind', 'market').is('market_id', null).order('submitted_at', { ascending: false }).limit(100);
    if (!error) setMarketProposals((data || []).filter((proposal) => city === '全部' || proposal.payload?.city === city));
  };
  const markets = data?.markets || []; const cities = useMemo(() => [...new Set(markets.map((item) => item.city))], [markets]);
  const visible = useMemo(() => { const keyword = query.trim().toLowerCase(); const items = prototype ? PROTOTYPE_STALLS : markets; return items.filter((item) => (city === '全部' || item.city === city) && (!keyword || `${item.name}${item.city}${item.district}`.toLowerCase().includes(keyword))).map((item) => ({ ...item, distanceKm: distanceKm(userLocation, item) })).sort((a, b) => (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999)); }, [city, markets, prototype, query, userLocation]);
  const pilotMarkets = ['tw-taoyuan-zhongli', 'tw-taoyuan-zhongyuan'].map((id) => markets.find((market) => market.id === id)).filter(Boolean);
  const [exploreAll, setExploreAll] = useState(false); const [mapOpen, setMapOpen] = useState(false);
  const focusMarket = useMemo(() => {
    if (!visible.length) return null;
    if (userLocation || city !== '全部' || query.trim()) return visible[0];
    return visible.find((item) => /中壢|中原/.test(item.name)) || visible[0];
  }, [city, query, userLocation, visible]);
  const showToast = (message) => { setToast(message); window.setTimeout(() => setToast(''), 3200); };
  const selectMarket = async (market, stayOnPage = false) => {
    if (!stayOnPage && window.location.pathname !== `/markets/${encodeURIComponent(market.id)}`) { window.location.href = `/markets/${encodeURIComponent(market.id)}`; return; } setShowContribution(false); setProposalError(''); setProposals([]); setRatingSummaries({}); setMarketDbId(null);
    if (!supabaseConfigured || !supabase || prototype) return;
    setCommunityBusy(true);
    const { data: dbMarket, error: marketError } = await supabase.from('markets').select('id').eq('external_id', market.id).maybeSingle();
    if (marketError) setProposalError(`共同資料載入失敗：${marketError.message}`);
    if (dbMarket?.id) {
      setMarketDbId(dbMarket.id);
      const { data: proposalRows, error: proposalLoadError } = await supabase.from('proposals').select('id,kind,market_id,adopted_stall_id,payload,source_url,source_title,status,submitted_at,support_count,oppose_count,needs_evidence_count').eq('market_id', dbMarket.id).order('submitted_at', { ascending: false }).limit(50);
      if (proposalLoadError) setProposalError(`提案載入失敗：${proposalLoadError.message}`); else setProposals(proposalRows || []);
      const { data: ratingRows } = await supabase.from('stall_rating_summaries').select('stall_id,average_stars,rating_count');
      setRatingSummaries(Object.fromEntries((ratingRows || []).map((row) => [row.stall_id, row])));
    }
    setCommunityBusy(false);
  };
  const sendMagicLink = async ({ captchaToken, onCaptchaReset }) => { if (!supabase) return; setAuthBusy(true); setAuthMessage(''); const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin, captchaToken } }); setAuthMessage(error ? `登入連結寄送失敗：${error.message}` : '登入連結已寄出，請查看信箱後回到本頁。'); onCaptchaReset?.(); setAuthBusy(false); };
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setAuthMessage('已登出'); };
  const moderateProposal = async (proposalId, status, decisionReason) => {
    if (!supabase || !role || !['moderator', 'admin'].includes(role)) return { error: '目前帳號沒有管理審核權限。' };
    const { error } = await supabase.rpc('moderate_proposal', { p_proposal_id: proposalId, p_status: status, p_decision_reason: decisionReason || null });
    if (error) return { error: `審核沒有儲存：${error.message}` };
    showToast(status === 'adopted' ? '提案已採用，正式攤位已建立' : '提案審核已更新');
    if (routeMarket) await selectMarket(routeMarket, true);
    return {};
  };
  const ensureAnonymous = async (captchaToken) => { if (!supabase) throw new Error('Supabase 尚未設定'); if (user && !isAnonymousUser(user)) return user; if (!turnstileSiteKey) throw new Error('匿名投稿尚未啟用：管理者需要先設定 Turnstile site key。'); if (user) return user; if (!captchaToken) throw new Error('請先完成 Cloudflare 人機驗證。'); const { data: authData, error } = await supabase.auth.signInAnonymously({ options: { captchaToken } }); if (error) throw error; setUser(authData.user); return authData.user; };
  const submitProposal = async ({ kind, name, cityName, district, address, locationNote, sourceUrl, sourceTitle, note, marketId, captchaToken, onCaptchaReset }) => {
    if (!supabase) { setProposalError('社群功能尚未連線，提案沒有送出。'); return; }
    setProposalBusy(true); setProposalError('');
    try {
      const submitter = await ensureAnonymous(captchaToken);
      const { data: proposal, error } = await supabase.from('proposals').insert({ kind, market_id: kind === 'stall' ? marketId : null, submitted_by: submitter.id, payload: { name: name.trim(), city: cityName?.trim() || null, district: district?.trim() || null, address: address?.trim() || null, location_note: locationNote?.trim() || null, note: note.trim(), external_market_id: kind === 'stall' ? (routeMarket?.id || null) : null }, source_url: sourceUrl.trim(), source_title: sourceTitle.trim() || null, status: 'pending' }).select('id,kind,market_id,adopted_stall_id,payload,source_url,source_title,status,submitted_at,support_count,oppose_count,needs_evidence_count').single();
      if (error) throw error;
      setProposals((current) => [proposal, ...current]); if (kind === 'market') await loadMarketProposals(); setShowContribution(false); showToast('提案已送出，狀態為待確認');
    } catch (error) { onCaptchaReset?.(); setProposalError(`提案沒有送出：${error.message}`); } finally { setProposalBusy(false); }
  };
  const voteOnProposal = async (proposalId, choice) => {
    if (!supabase) { setProposalError('社群功能尚未連線，表決沒有送出。'); return; }
    if (!user || isAnonymousUser(user)) { setAuthMessage('請先使用 email magic link 登入，才能參與表決。'); return; }
    setProposalBusy(true); setProposalError(''); const { error } = await supabase.rpc('cast_proposal_vote', { p_proposal_id: proposalId, p_choice: choice }); if (error) setProposalError(`表決沒有送出：${error.message}`); else { showToast('你的表決已更新'); if (routeMarket) await selectMarket(routeMarket, true); else await loadMarketProposals(); } setProposalBusy(false);
  };
  const rateStall = async (stallId, stars) => {
    if (!supabase) { setProposalError('社群功能尚未連線，星評沒有送出。'); return; }
    if (!user || isAnonymousUser(user)) { setAuthMessage('請先使用 email magic link 登入，才能留下星評。'); return; }
    setProposalBusy(true); const { error } = await supabase.rpc('rate_adopted_stall', { p_stall_id: stallId, p_stars: stars }); if (error) setProposalError(`星評沒有送出：${error.message}`); else { showToast('你的星評已更新'); if (routeMarket) await selectMarket(routeMarket, true); } setProposalBusy(false);
  };
  const submitQualityReport = async ({ stallId, reason, description, sourceUrl, captchaToken, onCaptchaReset }) => {
    if (!supabase) { setProposalError('社群功能尚未連線，回報沒有送出。'); return; }
    setProposalBusy(true); setProposalError('');
    try {
      const submitter = await ensureAnonymous(captchaToken);
      const { error } = await supabase.rpc('submit_quality_report', { p_stall_id: stallId, p_reason: reason, p_description: description.trim(), p_source_url: sourceUrl.trim() });
      if (error) throw error;
      setReportTarget(null); showToast('資料品質回報已送出，狀態為待處理');
    } catch (error) { onCaptchaReset?.(); setProposalError(`回報沒有送出：${error.message}`); } finally { setProposalBusy(false); }
  };
  const moderateQualityReport = async (reportId, status, decisionReason) => {
    if (!supabase || !role || !['moderator', 'admin'].includes(role)) return { error: '目前帳號沒有管理回報權限。' };
    const { error } = await supabase.rpc('moderate_quality_report', { p_report_id: reportId, p_status: status, p_decision_reason: decisionReason || null });
    if (error) return { error: `回報沒有儲存：${error.message}` };
    showToast('資料品質回報已更新'); return {};
  };
  const locate = () => { if (!navigator.geolocation) { showToast('此瀏覽器不支援定位，請改用縣市選擇'); return; } setLocating(true); navigator.geolocation.getCurrentPosition((position) => { setUserLocation([position.coords.latitude, position.coords.longitude]); showToast('已取得你的位置；目前資料仍需補齊座標才能計算距離'); setLocating(false); }, () => { showToast('定位未授權，請用上方縣市選擇'); setLocating(false); }, { timeout: 7000 }); };
  const focusAuth = () => { setAuthOpen(true); window.setTimeout(() => document.getElementById('community-auth')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); };
  const openContribution = () => { setProposalError(''); setShowContribution(true); window.setTimeout(() => { const form = document.querySelector('.standalone-contribution'); form?.scrollIntoView({ behavior: 'smooth', block: 'center' }); form?.querySelector('input')?.focus(); }, 0); };
  const adoptedStall = proposals.find((proposal) => proposal.status === 'adopted' && proposal.adopted_stall_id);
  const routeMarket = markets.find((market) => market.id === routeExternalId);
  useEffect(() => { if (routeMarket) selectMarket(routeMarket, true); }, [routeMarket?.id]);  if (routeExternalId && data && !routeMarket) return <div className="registry-app"><header className="registry-header"><a className="registry-brand" href="/"><span><MapPin size={20} /></span><b>夜市社群</b><small>全台夜市資料庫</small></a></header><main className="page-shell route-empty"><span className="section-label">找不到夜市</span><h1>這個夜市尚未在名錄中。</h1><a className="back-link" href="/">返回夜市社群</a></main></div>;
  if (routeMarket) return <div className="registry-app"><header className="registry-header"><a className="registry-brand" href="/"><span><MapPin size={20} /></span><b>夜市社群</b><small>全台夜市資料庫</small></a><a className="header-auth" href="/">回到首頁</a></header><MarketPage market={routeMarket} proposals={proposals} ratingSummaries={ratingSummaries} communityBusy={communityBusy} proposalError={proposalError} setProposalError={setProposalError} showContribution={showContribution} setShowContribution={setShowContribution} reportTarget={reportTarget} setReportTarget={setReportTarget} user={user} proposalBusy={proposalBusy} marketDbId={marketDbId} submitProposal={submitProposal} voteOnProposal={voteOnProposal} rateStall={rateStall} submitQualityReport={submitQualityReport} authBusy={authBusy} authMessage={authMessage} email={email} setEmail={setEmail} sendMagicLink={sendMagicLink} signOut={signOut} authOpen={authOpen} setAuthOpen={setAuthOpen} onRefresh={() => selectMarket(routeMarket, true)} onBack={() => {}} />{toast && <div className="registry-toast"><Check size={16} />{toast}</div>}</div>;
  return <div className="registry-app">
    <header className="registry-header"><a className="registry-brand" href="/"><span><MapPin size={20} /></span><b>夜市社群</b><small>全台夜市資料庫</small></a><div className="header-source"><Database size={15} /> 經濟部資料 <a href="https://data.gov.tw/dataset/95760" target="_blank" rel="noreferrer">95760</a></div>{!supabaseConfigured ? <span className="header-readonly">唯讀名錄</span> : user && !isAnonymousUser(user) ? <details className="member-menu"><summary><span className="member-menu-label"><b>會員</b><small>{user.email}</small></span><ArrowRight size={14} /></summary><div className="member-menu-popover"><AuthPanel user={user} authBusy={authBusy} authMessage={authMessage} email={email} setEmail={setEmail} onSendMagicLink={sendMagicLink} onSignOut={signOut} authOpen={authOpen} setAuthOpen={setAuthOpen} /><MyQualityReports user={user} /><AdminPanel role={role} busy={proposalBusy} onModerate={moderateProposal} onQualityModerate={moderateQualityReport} /></div></details> : <button className="header-auth" onClick={focusAuth}><LogIn size={15} /> 登入參與表決</button>}<button className="header-contribute" disabled={!supabaseConfigured} onClick={openContribution}><Plus size={16} /> 新增提案</button></header>{(!supabaseConfigured || (user && !isAnonymousUser(user)) || !authOpen) ? null : <div id="community-auth" className="header-auth-drawer"><AuthPanel user={user} authBusy={authBusy} authMessage={authMessage} email={email} setEmail={setEmail} onSendMagicLink={sendMagicLink} onSignOut={signOut} authOpen={authOpen} setAuthOpen={setAuthOpen} /></div>}
    <main className="registry-main"><section className="community-hero"><div className="hero-copy"><div className="eyebrow">NIGHT MARKET COMMUNITY</div><h1>先找到你附近的夜市。</h1><p>一起補充、一起確認，讓每個夜市都更好逛。</p>{focusMarket && <button className="hero-cta" onClick={() => selectMarket(focusMarket)}><MapPin size={16} /> 查看{focusMarket.name}</button>}</div><figure className="hero-art"><img src="/assets/night-market-banner-v2.jpg" alt="夜市意象插畫" /><figcaption>夜市意象插畫</figcaption></figure></section><DiscoveryPanel query={query} setQuery={setQuery} city={city} setCity={setCity} cities={cities} locate={locate} locating={locating} setExploreAll={setExploreAll} onCommunity={() => document.querySelector(".market-proposal-feed")?.scrollIntoView({ behavior: "smooth" })} visible={visible} /><ExploreMosaic pilotMarkets={pilotMarkets} visible={visible} markets={markets} cities={cities} setExploreAll={setExploreAll} />{showContribution && <section className="standalone-contribution"><ContributionForm selected={null} user={user} error={proposalError} marketDbId={null} busy={proposalBusy} onSubmit={submitProposal} onClose={() => setShowContribution(false)} /></section>}
      <div className="registry-grid" id="registry-explorer"><section className="market-list"><div className="list-heading"><div><span className="section-label">{userLocation ? '離你最近' : '推薦入口'}</span><h2>{query.trim() ? '搜尋結果' : city === '全部' ? (userLocation ? '附近的夜市' : '推薦入口') : `${city}的夜市`}</h2></div>{focusMarket && <span className="result-count">{focusMarket.distanceKm != null ? `約 ${focusMarket.distanceKm.toFixed(1)} 公里` : '可先查看'}</span>}</div>{prototype && <div className="prototype-note"><Info size={16} /><span>這是原型用的饒河街攤位資料，尚未接入全台名錄與共同資料庫。</span></div>}<div className="snapshot-note"><Info size={15} /> {userLocation ? '依目前定位排序；距離為約略估算。' : '尚未定位，先顯示中壢／中原試行夜市；允許定位後會改為最近的夜市。'}</div>{focusMarket ? <button className="market-card market-card-focus" onClick={() => selectMarket(focusMarket)}><span className="market-icon"><MapPin size={19} /></span><span className="market-card-copy"><b>{focusMarket.name}</b><small>{focusMarket.city} · {focusMarket.district}{focusMarket.distanceKm != null ? ` · 約 ${focusMarket.distanceKm.toFixed(1)} 公里` : ''}</small><em>{focusMarket.address || '地址待官方 CSV 匯入'}</em></span><span className="market-status">查看夜市</span></button> : <div className="empty-result">找不到符合的夜市，試試選擇其他縣市。</div>}<button className="explore-toggle" onClick={() => setExploreAll((value) => !value)} aria-expanded={exploreAll}>{exploreAll ? '收合完整名錄' : `探索全部夜市（${visible.length} 筆）`}<ArrowRight size={15} className={exploreAll ? 'rotate-90' : ''} /></button>{exploreAll && <div className="market-cards market-cards-explore">{visible.filter((market) => market.id !== focusMarket?.id).map((market) => <button key={market.id} className="market-card" onClick={() => selectMarket(market)}><span className="market-icon"><MapPin size={19} /></span><span className="market-card-copy"><b>{market.name}</b><small>{market.city} · {market.district}{market.distanceKm != null ? ` · 約 ${market.distanceKm.toFixed(1)} 公里` : ''}</small><em>{market.address || '地址待官方 CSV 匯入'}</em></span><span className="market-status">{market.reviewStatus === '待複核候選' ? '待複核' : market.coordinateStatus === 'unverified' ? '座標待核對' : '入口/商圈近似'}</span></button>)}</div>}<button className={prototype ? 'prototype-toggle active' : 'prototype-toggle'} onClick={() => setPrototype((value) => !value)}>{prototype ? '返回快照名錄' : '查看饒河街原型資料'} <ArrowRight size={15} /></button></section><details className="map-details" onToggle={(event) => setMapOpen(event.currentTarget.open)}><summary><span className="section-label">地圖入口</span><b>查看全台夜市地圖</b><span className="map-summary-hint">{userLocation ? '已依你的定位標示附近點位' : '點開探索各地位置'}</span></summary>{mapOpen && <div className="registry-map"><Suspense fallback={<div className="map-loading" role="status"><LoaderCircle className="spin" size={17} /> 地圖載入中…</div>}><MapLoadBoundary><LazyMarketMap city={city} userLocation={userLocation} markets={markets} onSelect={selectMarket} /></MapLoadBoundary></Suspense><div className="map-overlay"><span className="map-tag"><span /> 可定位點位</span><b>{city === '全部' ? '快照夜市分布' : `${city}夜市`}</b><p>{userLocation ? '已依可定位點位計算約略距離。' : '點選橘色點位查看夜市詳情。'}</p></div><div className="map-footnote">地圖底圖 © OpenStreetMap · 點位為入口或商圈近似位置</div></div>}</details></div>
      <section className="market-proposal-feed" id="market-proposal-feed"><div className="list-heading"><div><span className="section-label">社群動態</span><h2>{city === '全部' ? '全台提案' : `${city}提案`}</h2></div><span className="result-count">{marketProposals.length} 筆</span></div>{!supabaseConfigured && <p className="form-hint">Supabase 尚未設定；新增夜市提案列表會在連線後顯示。</p>}{supabaseConfigured && !marketProposals.length && <p className="community-empty"><span>✦</span> 目前還沒有提案，成為第一位分享附近夜市的人吧。</p>}<div className="feed-list">{marketProposals.map((proposal, index) => <article className={`feed-row ${index === 0 ? 'feed-row-featured' : ''}`} key={proposal.id}><div className="feed-meta"><span>在地貢獻者</span><time dateTime={proposal.submitted_at}>{formatRelativeTime(proposal.submitted_at)}</time><span className="feed-kind">{formatProposalKind(proposal.kind)}</span><span className="proposal-status">{proposalStatusLabel[proposal.status] || proposal.status}</span></div><h3>{proposal.payload?.name || '未命名提案'}</h3><p className="feed-summary">{formatProposalSummary(proposal)}</p><a className="feed-source" href={proposal.source_url} target="_blank" rel="noreferrer"><span>來源</span>{proposal.source_title || proposal.source_url} <ExternalLink size={12} /></a><div className="feed-vote-row"><div className="vote-summary"><span>支持 {proposal.support_count || 0}</span><span>反對 {proposal.oppose_count || 0}</span><span>需補證據 {proposal.needs_evidence_count || 0}</span></div>{proposal.status !== 'rejected' && proposal.status !== 'adopted' && <div className="proposal-votes"><button disabled={proposalBusy || !user || isAnonymousUser(user)} onClick={() => voteOnProposal(proposal.id, 'support')}>支持</button><button disabled={proposalBusy || !user || isAnonymousUser(user)} onClick={() => voteOnProposal(proposal.id, 'oppose')}>反對</button><button disabled={proposalBusy || !user || isAnonymousUser(user)} onClick={() => voteOnProposal(proposal.id, 'needs_evidence')}>需補證據</button></div>}</div></article>)}</div></section><section className="contributor-callout"><div><span className="section-label">在地貢獻者</span><h2>你家附近的夜市，資料完整嗎？</h2><p>選一個夜市後，可以接著補充地址、營業日、攤位或回報變動。送出前會清楚標示為待審投稿，不會直接冒充公開資料。</p></div><button disabled={!supabaseConfigured} onClick={openContribution}>新增夜市 <ArrowRight size={16} /></button></section></main>
    {toast && <div className="registry-toast"><Check size={16} />{toast}</div>}</div>;
}
export default App;
