import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet';
import { MapPin, LocateFixed, Search, Plus, Database, ArrowRight, X, Check, Info, LogIn, LogOut, Send, Star, LoaderCircle, ExternalLink } from 'lucide-react';
import { supabase, supabaseConfigured, turnstileSiteKey } from './lib/supabaseClient';
import TurnstileWidget from './components/TurnstileWidget';
import 'leaflet/dist/leaflet.css';

const CITY_CENTERS = { 臺北市: [25.04, 121.52], 新北市: [25.01, 121.46], 桃園市: [24.99, 121.30], 臺中市: [24.15, 120.67], 臺南市: [22.99, 120.20], 花蓮縣: [23.99, 121.60], 臺東縣: [22.76, 121.14] };
const PROTOTYPE_STALLS = [
  { id: 'prototype-1', name: '陳董藥燉排骨', city: '臺北市', district: '松山區', type: '主食', emoji: '🍲', note: '饒河街原型攤位資料', address: '饒河街觀光夜市', source: 'prototype seed data' },
  { id: 'prototype-2', name: '福州世祖胡椒餅', city: '臺北市', district: '松山區', type: '主食', emoji: '🥙', note: '饒河街原型攤位資料', address: '饒河街觀光夜市', source: 'prototype seed data' },
  { id: 'prototype-3', name: '阿國滷味', city: '臺北市', district: '松山區', type: '主食', emoji: '🍢', note: '饒河街原型攤位資料', address: '饒河街觀光夜市', source: 'prototype seed data' },
];

function MapCenter({ city, userLocation, markets, onSelect }) {
  const map = useMap();
  useEffect(() => { map.flyTo(userLocation || CITY_CENTERS[city] || [23.7, 120.9], userLocation ? 12 : 8, { duration: .45 }); }, [map, city, userLocation]);
  return <>{markets.filter((item) => item.latitude != null && (city === '全部' || item.city === city)).map((item) => <CircleMarker key={item.id} center={[item.latitude, item.longitude]} radius={9} pathOptions={{ color: '#fffdf8', weight: 3, fillColor: '#df6c43', fillOpacity: 1 }} eventHandlers={{ click: () => onSelect(item) }}><title>{item.name}</title></CircleMarker>)}{userLocation && <CircleMarker center={userLocation} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#367d8d', fillOpacity: 1 }} />}</>;
}

function distanceKm(from, item) {
  if (!from || item.latitude == null || item.longitude == null) return null;
  const [lat, lon] = from; const rad = Math.PI / 180; const a = Math.sin((item.latitude - lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(item.latitude * rad) * Math.sin((item.longitude - lon) * rad / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const isAnonymousUser = (user) => user?.is_anonymous === true || user?.user_metadata?.is_anonymous === true;
const proposalStatusLabel = { pending: '待確認', discussion: '討論中', needs_evidence: '待補資料', adopted: '已採用', rejected: '未採用' };

function AuthPanel({ user, authBusy, authMessage, email, setEmail, onSendMagicLink, onSignOut }) {
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaError, setCaptchaError] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  if (!supabaseConfigured) return <div className="community-status offline"><Info size={16} /><span>社群功能尚未連線；目前只顯示唯讀名錄。設定 Supabase 環境變數後才會開放投稿、登入與評分。</span></div>;
  if (user && !isAnonymousUser(user)) return <div className="community-status online"><span><b>已登入會員</b><small>{user.email}</small></span><button className="text-button" onClick={onSignOut}><LogOut size={15} /> 登出</button></div>;
  const captchaMissing = !turnstileSiteKey;
  const submitMagicLink = (event) => { event.preventDefault(); if (captchaMissing) { setCaptchaError('登入需要啟用 Turnstile site key。'); return; } if (!captchaToken) { setCaptchaError('請先完成 Cloudflare 人機驗證。'); return; } onSendMagicLink({ event, captchaToken, onCaptchaReset: () => { setCaptchaToken(''); setCaptchaReset((value) => value + 1); } }); };
  return <div className="community-status auth-form"><div><b>{user ? '可免登入投稿' : '登入後可參與表決與星評'}</b><small>{user ? '目前是暫時投稿身分；表決和星評仍需會員登入。' : '投稿可免登入，表決和星評需要 email magic link。'}</small></div><form onSubmit={submitMagicLink}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="你的 email" required />{captchaMissing ? <div className="inline-warning"><Info size={15} /> 登入需要 Turnstile site key。</div> : <TurnstileWidget siteKey={turnstileSiteKey} resetSignal={captchaReset} onToken={(token) => { setCaptchaToken(token); setCaptchaError(''); }} onError={setCaptchaError} />}<button className="text-button" disabled={authBusy || captchaMissing || !captchaToken}>{authBusy ? <LoaderCircle className="spin" size={15} /> : <LogIn size={15} />} 寄送登入連結</button></form>{captchaError && <small className="community-message">{captchaError}</small>}{authMessage && <small className="community-message">{authMessage}</small>}</div>;
}

function ContributionForm({ selected, user, marketDbId, busy, onSubmit, onClose }) {
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
  return <form className="contribution-form" onSubmit={submit}><div className="form-heading"><div><span className="section-label">新增提案</span><h3>{selected ? `補充「${selected.name}」` : '新增夜市'}</h3></div><button type="button" className="modal-close" onClick={onClose} aria-label="關閉"><X size={18} /></button></div><label>類型<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="market">新增夜市</option>{selected && <option value="stall">新增攤位</option>}</select></label>{kind === 'stall' && !marketDbId && <div className="inline-warning"><Info size={15} /> 此夜市尚未同步到共同資料庫，暫時無法提交攤位提案。</div>}<label>名稱<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} placeholder="例如：阿明蚵仔煎" /></label>{kind === 'market' && <><label>縣市<input value={cityName} onChange={(event) => setCityName(event.target.value)} required maxLength={100} placeholder="例如：桃園市" /></label><label>區域<input value={district} onChange={(event) => setDistrict(event.target.value)} required maxLength={100} placeholder="例如：中壢區" /></label><label>地址或明確位置描述<input value={address} onChange={(event) => setAddress(event.target.value)} required maxLength={500} placeholder="例如：中央西路與中美路附近" /></label></>}{kind === 'stall' && <label>位置描述<input value={locationNote} onChange={(event) => setLocationNote(event.target.value)} required maxLength={500} placeholder="例如：入口右側第三排" /></label>}<label>資料來源 URL <input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required placeholder="https://…" /></label><label>來源名稱（選填）<input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} maxLength={200} /></label><label>補充說明（選填）<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} /></label>{captchaMissing ? <div className="inline-warning"><Info size={15} /> 匿名投稿需要啟用人機驗證；目前尚未設定 Turnstile site key。</div> : !user && <><p className="form-hint">首次匿名投稿前，請先完成 Cloudflare 人機驗證。</p><TurnstileWidget siteKey={turnstileSiteKey} resetSignal={captchaReset} onToken={(token) => { setCaptchaToken(token); setCaptchaError(''); }} onError={setCaptchaError} />{captchaError && <div className="inline-error"><Info size={15} /> {captchaError}</div>}</>}<p className="form-hint">送出後會以「待確認」公開顯示，來源會和提案一起保存；不會直接加入正式地圖。</p><button className="modal-action" disabled={busy || captchaMissing || (!user && !captchaToken) || (kind === 'stall' && !marketDbId)}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} 送出待確認提案</button></form>;
}

function App() {
  const [data, setData] = useState(null); const [city, setCity] = useState('全部'); const [query, setQuery] = useState('');
  const [userLocation, setUserLocation] = useState(null); const [locating, setLocating] = useState(false); const [prototype, setPrototype] = useState(false); const [selected, setSelected] = useState(null); const [toast, setToast] = useState('');
  const [user, setUser] = useState(null); const [email, setEmail] = useState(''); const [authBusy, setAuthBusy] = useState(false); const [authMessage, setAuthMessage] = useState('');
  const [communityBusy, setCommunityBusy] = useState(false); const [showContribution, setShowContribution] = useState(false); const [marketDbId, setMarketDbId] = useState(null); const [proposals, setProposals] = useState([]); const [marketProposals, setMarketProposals] = useState([]); const [ratingSummaries, setRatingSummaries] = useState({}); const [proposalBusy, setProposalBusy] = useState(false); const [proposalError, setProposalError] = useState('');
  useEffect(() => { fetch('/data/night-markets.json').then((response) => response.json()).then(setData).catch(() => setToast('夜市資料載入失敗，請重新整理')); }, []);
  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data: sessionData }) => { if (active) setUser(sessionData.session?.user || null); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (active) setUser(session?.user || null); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
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
  const showToast = (message) => { setToast(message); window.setTimeout(() => setToast(''), 3200); };
  const selectMarket = async (market) => {
    setSelected(market); setShowContribution(false); setProposalError(''); setProposals([]); setRatingSummaries({}); setMarketDbId(null);
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
  const ensureAnonymous = async (captchaToken) => { if (!supabase) throw new Error('Supabase 尚未設定'); if (user && !isAnonymousUser(user)) return user; if (!turnstileSiteKey) throw new Error('匿名投稿尚未啟用：管理者需要先設定 Turnstile site key。'); if (user) return user; if (!captchaToken) throw new Error('請先完成 Cloudflare 人機驗證。'); const { data: authData, error } = await supabase.auth.signInAnonymously({ options: { captchaToken } }); if (error) throw error; setUser(authData.user); return authData.user; };
  const submitProposal = async ({ kind, name, cityName, district, address, locationNote, sourceUrl, sourceTitle, note, marketId, captchaToken, onCaptchaReset }) => {
    if (!supabase) { setProposalError('社群功能尚未連線，提案沒有送出。'); return; }
    setProposalBusy(true); setProposalError('');
    try {
      const submitter = await ensureAnonymous(captchaToken);
      const { data: proposal, error } = await supabase.from('proposals').insert({ kind, market_id: kind === 'stall' ? marketId : null, submitted_by: submitter.id, payload: { name: name.trim(), city: cityName?.trim() || null, district: district?.trim() || null, address: address?.trim() || null, location_note: locationNote?.trim() || null, note: note.trim(), external_market_id: kind === 'stall' ? (selected?.id || null) : null }, source_url: sourceUrl.trim(), source_title: sourceTitle.trim() || null, status: 'pending' }).select('id,kind,market_id,adopted_stall_id,payload,source_url,source_title,status,submitted_at,support_count,oppose_count,needs_evidence_count').single();
      if (error) throw error;
      setProposals((current) => [proposal, ...current]); if (kind === 'market') await loadMarketProposals(); setShowContribution(false); showToast('提案已送出，狀態為待確認');
    } catch (error) { onCaptchaReset?.(); setProposalError(`提案沒有送出：${error.message}`); } finally { setProposalBusy(false); }
  };
  const voteOnProposal = async (proposalId, choice) => {
    if (!supabase) { setProposalError('社群功能尚未連線，表決沒有送出。'); return; }
    if (!user || isAnonymousUser(user)) { setAuthMessage('請先使用 email magic link 登入，才能參與表決。'); return; }
    setProposalBusy(true); setProposalError(''); const { error } = await supabase.rpc('cast_proposal_vote', { p_proposal_id: proposalId, p_choice: choice }); if (error) setProposalError(`表決沒有送出：${error.message}`); else { showToast('你的表決已更新'); if (selected) await selectMarket(selected); else await loadMarketProposals(); } setProposalBusy(false);
  };
  const rateStall = async (stallId, stars) => {
    if (!supabase) { setProposalError('社群功能尚未連線，星評沒有送出。'); return; }
    if (!user || isAnonymousUser(user)) { setAuthMessage('請先使用 email magic link 登入，才能留下星評。'); return; }
    setProposalBusy(true); const { error } = await supabase.rpc('rate_adopted_stall', { p_stall_id: stallId, p_stars: stars }); if (error) setProposalError(`星評沒有送出：${error.message}`); else { showToast('你的星評已更新'); if (selected) await selectMarket(selected); } setProposalBusy(false);
  };
  const locate = () => { if (!navigator.geolocation) { showToast('此瀏覽器不支援定位，請改用縣市選擇'); return; } setLocating(true); navigator.geolocation.getCurrentPosition((position) => { setUserLocation([position.coords.latitude, position.coords.longitude]); showToast('已取得你的位置；目前資料仍需補齊座標才能計算距離'); setLocating(false); }, () => { showToast('定位未授權，請用上方縣市選擇'); setLocating(false); }, { timeout: 7000 }); };
  return <div className="registry-app">
    <header className="registry-header"><a className="registry-brand" href="/"><span><MapPin size={20} /></span><b>夜市地圖</b><small>全台名錄</small></a><div className="header-source"><Database size={15} /> 經濟部夜市資料集 <a href="https://data.gov.tw/dataset/95760" target="_blank" rel="noreferrer">95760</a></div><button className="header-contribute" disabled={!supabaseConfigured} onClick={() => setShowContribution(true)}><Plus size={16} /> 新增夜市</button></header>
    <main className="registry-main"><section className="registry-intro"><div className="eyebrow">TAIWAN NIGHT MARKET REGISTRY</div><h1>先找到你附近的夜市。</h1><p>固定地點、定期營業的夜市名錄，從官方資料開始，交給各地貢獻者一起補完整。</p><div className="location-controls"><button className="locate-button" onClick={locate}><LocateFixed size={16} className={locating ? 'spin' : ''} /> {locating ? '定位中…' : '使用我的位置'}</button><label><span>或選擇縣市</span><select value={city} onChange={(event) => setCity(event.target.value)}><option value="全部">全台</option>{cities.map((item) => <option key={item}>{item}</option>)}</select></label><label className="search-input"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋夜市名稱" /></label></div></section><AuthPanel user={user} authBusy={authBusy} authMessage={authMessage} email={email} setEmail={setEmail} onSendMagicLink={sendMagicLink} onSignOut={signOut} />{showContribution && !selected && <section className="standalone-contribution"><ContributionForm selected={null} user={user} marketDbId={null} busy={proposalBusy} onSubmit={submitProposal} onClose={() => setShowContribution(false)} /></section>}
      <section className="registry-stats"><div><strong>{markets.length}</strong><span>快照名錄</span></div><div><strong>{cities.length}</strong><span>縣市</span></div><div><strong>{markets.filter((item) => item.latitude).length}</strong><span>可定位點位</span></div><button className={prototype ? 'prototype-toggle active' : 'prototype-toggle'} onClick={() => setPrototype((value) => !value)}>{prototype ? '返回快照名錄' : '查看饒河街原型資料'} <ArrowRight size={15} /></button></section>
      <div className="registry-grid"><section className="market-list"><div className="list-heading"><div><span className="section-label">{userLocation ? '依距離排序' : '可探索夜市'}</span><h2>{city === '全部' ? '政府快照名錄' : `${city}的夜市`}</h2></div><span className="result-count">{visible.length} 筆</span></div>{prototype && <div className="prototype-note"><Info size={16} /><span>這是原型用的饒河街攤位資料，尚未接入全台名錄與共同資料庫。</span></div>}<div className="snapshot-note"><Info size={15} /> 2026-09-18 非即時快照；候選資料仍待人工複核，不能視為完整即時全台名錄。</div><div className="market-cards">{visible.map((market) => <button key={market.id} className="market-card" onClick={() => selectMarket(market)}><span className="market-icon"><MapPin size={19} /></span><span className="market-card-copy"><b>{market.name}</b><small>{market.city} · {market.district}{market.distanceKm != null ? ` · 約 ${market.distanceKm.toFixed(1)} 公里` : ''}</small><em>{market.address || '地址待官方 CSV 匯入'}</em></span><span className="market-status">{market.reviewStatus === '待複核候選' ? '待複核' : market.coordinateStatus === 'unverified' ? '座標待核對' : '入口/商圈近似'}</span></button>)}{!visible.length && <div className="empty-result">找不到符合的夜市，試試選擇其他縣市。</div>}</div></section><section className="registry-map"><MapContainer center={[23.7, 120.9]} zoom={7} zoomControl={false} scrollWheelZoom><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapCenter city={city} userLocation={userLocation} markets={markets} onSelect={selectMarket} /></MapContainer><div className="map-overlay"><span className="map-tag"><span /> 可定位點位</span><b>{city === '全部' ? '快照夜市分布' : `${city}夜市`}</b><p>{userLocation ? '已依可定位點位計算約略距離。' : '點選橘色點位查看夜市詳情。'}</p></div><div className="map-footnote">地圖底圖 © OpenStreetMap · 點位為入口或商圈近似位置</div></section></div>
      <section className="market-proposal-feed"><div className="list-heading"><div><span className="section-label">尚待確認的新增夜市</span><h2>{city === '全部' ? '全台提案' : `${city}提案`}</h2></div><span className="result-count">{marketProposals.length} 筆</span></div>{!supabaseConfigured && <p className="form-hint">Supabase 尚未設定；新增夜市提案列表會在連線後顯示。</p>}{supabaseConfigured && !marketProposals.length && <p className="form-hint">目前沒有符合縣市的新增夜市提案。</p>}{marketProposals.map((proposal) => <article className="proposal-card" key={proposal.id}><div><b>{proposal.payload?.name || '未命名夜市'}</b><span className="proposal-status">{proposalStatusLabel[proposal.status] || proposal.status}</span></div><p>{proposal.payload?.city}・{proposal.payload?.district}・{proposal.payload?.address}</p><a href={proposal.source_url} target="_blank" rel="noreferrer">{proposal.source_title || proposal.source_url} <ExternalLink size={13} /></a><div className="vote-summary"><span>支持 {proposal.support_count || 0}</span><span>反對 {proposal.oppose_count || 0}</span><span>需補證據 {proposal.needs_evidence_count || 0}</span></div>{proposal.status !== 'rejected' && proposal.status !== 'adopted' && <div className="proposal-votes"><button disabled={proposalBusy || !user || isAnonymousUser(user)} onClick={() => voteOnProposal(proposal.id, 'support')}>支持</button><button disabled={proposalBusy || !user || isAnonymousUser(user)} onClick={() => voteOnProposal(proposal.id, 'oppose')}>反對</button><button disabled={proposalBusy || !user || isAnonymousUser(user)} onClick={() => voteOnProposal(proposal.id, 'needs_evidence')}>需補證據</button></div>}</article>)}</section><section className="contributor-callout"><div><span className="section-label">在地貢獻者</span><h2>你家附近的夜市，資料完整嗎？</h2><p>選一個夜市後，可以接著補充地址、營業日、攤位或回報變動。送出前會清楚標示為待審投稿，不會直接冒充公開資料。</p></div><button disabled={!supabaseConfigured} onClick={() => setShowContribution(true)}>新增夜市 <ArrowRight size={16} /></button></section></main>
    {selected && <div className="market-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}><section className="market-modal"><button className="modal-close" onClick={() => setSelected(null)} aria-label="關閉"><X size={18} /></button><span className="section-label">夜市入口</span><h2>{selected.name}</h2><p>{selected.city} · {selected.district}</p><div className="modal-detail"><span>資料來源</span><b>{selected.source || '政府資料快照'}</b>{selected.datasetSerial && <><span>快照紀錄</span><b>序號 {selected.datasetSerial} · 2026-09-18 非即時備份</b></>}<span>座標狀態</span><b>{selected.coordinateStatus === 'unverified' ? '尚未核對，不顯示精確距離' : selected.coordinatePrecision}</b>{selected.coordinateSource && <><span>座標連結</span><a href={selected.coordinateSource} target="_blank" rel="noreferrer">查看地圖來源 <ExternalLink size={13} /></a></>}</div>{communityBusy && <div className="community-loading"><LoaderCircle className="spin" size={15} /> 載入社群資料…</div>}{proposalError && <div className="inline-error"><Info size={15} /> {proposalError}</div>}<div className="modal-actions"><button className="modal-action" onClick={() => setShowContribution(true)}><Plus size={16} /> 新增提案</button><button className="modal-action secondary" onClick={() => selectMarket(selected)}><ArrowRight size={16} /> 重新整理提案</button></div>{showContribution && <ContributionForm selected={selected} user={user} marketDbId={marketDbId} busy={proposalBusy} onSubmit={submitProposal} onClose={() => setShowContribution(false)} />}<div className="proposal-list"><div className="proposal-list-heading"><span className="section-label">社群提案</span><span>{proposals.length} 筆</span></div>{!supabaseConfigured && <p className="form-hint">Supabase 尚未設定；提案、表決和星評不會假稱成功。</p>}{supabaseConfigured && !communityBusy && !proposals.length && <p className="form-hint">目前沒有這個夜市的公開提案。</p>}{proposals.map((proposal) => <article className="proposal-card" key={proposal.id}><div><b>{proposal.payload?.name || '未命名提案'}</b><span className="proposal-status">{proposalStatusLabel[proposal.status] || proposal.status}</span></div>{proposal.payload?.note && <p>{proposal.payload.note}</p>}<a href={proposal.source_url} target="_blank" rel="noreferrer">{proposal.source_title || proposal.source_url} <ExternalLink size={13} /></a><div className="vote-summary"><span>支持 {proposal.support_count || 0}</span><span>反對 {proposal.oppose_count || 0}</span><span>需補證據 {proposal.needs_evidence_count || 0}</span></div>{proposal.status !== 'rejected' && proposal.status !== 'adopted' && <div className="proposal-votes"><button disabled={proposalBusy || !user || isAnonymousUser(user)} onClick={() => voteOnProposal(proposal.id, 'support')}>支持</button><button disabled={proposalBusy || !user || isAnonymousUser(user)} onClick={() => voteOnProposal(proposal.id, 'oppose')}>反對</button><button disabled={proposalBusy || !user || isAnonymousUser(user)} onClick={() => voteOnProposal(proposal.id, 'needs_evidence')}>需補證據</button></div>}{proposal.status === 'adopted' && proposal.adopted_stall_id && <div className="adopted-rating"><span className="star-rating"><Star size={14} /> {ratingSummaries[proposal.adopted_stall_id] ? `${ratingSummaries[proposal.adopted_stall_id].average_stars} / 5（${ratingSummaries[proposal.adopted_stall_id].rating_count} 則）` : '尚無星評'}</span><span className="star-rating">留下評分 {[1, 2, 3, 4, 5].map((stars) => <button key={stars} disabled={proposalBusy || !user || isAnonymousUser(user)} onClick={() => rateStall(proposal.adopted_stall_id, stars)}>{stars}</button>)}</span></div>}{proposal.status === 'adopted' && !proposal.adopted_stall_id && <p className="form-hint">待正式攤位建立後才可評星。</p>}</article>)}</div>{!user && supabaseConfigured && <p className="form-hint">登入後可表決；投稿可免登入。匿名投稿身分不能投票或星評。</p>}</section></div>}{toast && <div className="registry-toast"><Check size={16} />{toast}</div>}</div>;
}
export default App;
