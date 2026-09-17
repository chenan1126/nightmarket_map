import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import L from 'leaflet';
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Compass,
  Heart,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Menu,
  Minus,
  Navigation,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { INITIAL_STALLS, MARKET_CENTER } from '../packages/shared/src/stalls.js';

const initialStalls = INITIAL_STALLS;

const categories = ['全部', '主食', '甜點', '飲品', '伴手禮'];
const addStallSchema = z.object({
  name: z.string().trim().min(2, '請至少輸入 2 個字'),
  type: z.string().min(1),
  price: z.string().min(1),
  note: z.string().trim().max(120, '推薦短句最多 120 字').optional(),
});

function Stars({ rating, small = false }) {
  return (
    <span className={`stars ${small ? 'stars-small' : ''}`} aria-label={`${rating} 顆星`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} size={small ? 12 : 14} fill={index < Math.round(rating) ? 'currentColor' : 'none'} />
      ))}
    </span>
  );
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <MapPin size={20} strokeWidth={2.4} />
    </div>
  );
}

function MapViewport({ selectedId, onSelect, onLocate, zoomSignal }) {
  const map = useMap();

  useEffect(() => {
    if (zoomSignal) map.setZoom(Math.max(13, Math.min(19, map.getZoom() + zoomSignal)));
  }, [map, zoomSignal]);

  useEffect(() => {
    if (selectedId) {
      const stall = initialStalls.find((item) => item.id === selectedId);
      if (stall) map.flyTo(stall.location, Math.max(map.getZoom(), 16), { duration: 0.5 });
    }
  }, [map, selectedId]);

  useMapEvents({
    locationfound: (event) => onLocate([event.latlng.lat, event.latlng.lng]),
  });

  return (
    <>
      <div className="map-topographic" aria-hidden="true" />
      <div className="map-market-label"><span className="market-label-dot" />饒河街觀光夜市</div>
      <div className="map-road-label road-label-one">八德路四段</div>
      <div className="map-road-label road-label-two">塔悠路</div>
      <Polyline positions={[[25.05012, 121.5757], [25.05042, 121.5767], [25.05085, 121.5787]]} pathOptions={{ color: '#f28a58', weight: 11, opacity: 0.82, lineCap: 'round' }} />
      <Polyline positions={[[25.04975, 121.5776], [25.05154, 121.5776]]} pathOptions={{ color: '#f5bb75', weight: 9, opacity: 0.84, lineCap: 'round' }} />
      <Circle center={MARKET_CENTER} radius={155} pathOptions={{ color: '#ea7554', weight: 1.5, dashArray: '7 8', fillColor: '#f8caa2', fillOpacity: 0.14 }} />
      {initialStalls.map((stall) => (
        <Marker
          key={stall.id}
          position={stall.location}
          icon={L.divIcon({
            className: `stall-map-marker ${selectedId === stall.id ? 'is-selected' : ''}`,
            html: `<span>${stall.emoji}</span>`,
            iconSize: [42, 42],
            iconAnchor: [21, 21],
          })}
          eventHandlers={{ click: () => onSelect(stall.id) }}
          title={stall.name}
        />
      ))}
      <CircleMarker center={MARKET_CENTER} radius={7} pathOptions={{ color: '#fff', weight: 3, fillColor: '#367d8d', fillOpacity: 1 }} />
    </>
  );
}

function MarketMap({ selectedId, onSelect, showToast }) {
  const [locating, setLocating] = useState(false);
  const [zoomSignal, setZoomSignal] = useState(0);
  const [userLocation, setUserLocation] = useState(null);

  const locate = () => {
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
        setLocating(false);
        showToast('已定位到你的位置');
      },
      () => {
        setLocating(false);
        showToast('目前無法取得位置，先以夜市入口為中心');
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
  };

  return (
    <section className="map-panel" aria-label="饒河街觀光夜市地圖">
      <MapContainer center={MARKET_CENTER} zoom={16} zoomControl={false} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewport selectedId={selectedId} onSelect={onSelect} onLocate={setUserLocation} zoomSignal={zoomSignal} />
        {userLocation && <CircleMarker center={userLocation} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#367d8d', fillOpacity: 1 }} />}
        <ZoomControl position="bottomright" />
      </MapContainer>
      <div className="map-headline">
        <div className="map-kicker"><span className="live-dot" />正在逛</div>
        <h2>饒河街觀光夜市</h2>
        <p>6 個攤位 · 約 2 小時前有人更新</p>
      </div>
      <div className="map-actions" aria-label="地圖操作">
        <button className="map-action-button" onClick={() => { setZoomSignal(1); }} aria-label="放大地圖"><Plus size={18} /></button>
        <button className="map-action-button" onClick={() => { setZoomSignal(-1); }} aria-label="縮小地圖"><Minus size={18} /></button>
        <button className="map-action-button" onClick={locate} aria-label="定位到我的位置"><LocateFixed size={18} className={locating ? 'spin' : ''} /></button>
      </div>
      <div className="map-key">
        <span><i className="key-marker key-marker-orange" />攤位</span>
        <span><i className="key-marker key-marker-blue" />夜市入口</span>
      </div>
      <div className="map-credit">地圖資料 © OpenStreetMap</div>
    </section>
  );
}

function StallCard({ stall, saved, selected, onSelect, onToggleSave }) {
  return (
    <article className={`stall-card ${selected ? 'is-selected' : ''}`}>
      <button className="stall-card-main" onClick={() => onSelect(stall.id)} aria-label={`查看 ${stall.name} 詳情`}>
        <div className="stall-photo" style={{ '--stall-color': stall.color }}><span>{stall.emoji}</span>{stall.status === 'open' && <i className="open-indicator" />}</div>
        <div className="stall-copy">
          <div className="stall-card-topline"><span className="stall-name">{stall.name}</span><span className={stall.status === 'open' ? 'open-text' : 'closed-text'}>{stall.status === 'open' ? '營業中' : '已打烊'}</span></div>
          <p className="stall-category">{stall.type} · {stall.distance.toFixed(1)} 公里</p>
          <div className="stall-rating"><Stars rating={stall.rating} small /><strong>{stall.rating.toFixed(1)}</strong><span>({stall.reviews})</span><em>{stall.price}</em></div>
        </div>
      </button>
      <button className={`save-button ${saved ? 'is-saved' : ''}`} onClick={() => onToggleSave(stall.id)} aria-label={`${saved ? '取消收藏' : '收藏'} ${stall.name}`}>
        <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}

function StallDetail({ stall, saved, onClose, onToggleSave, onRate, onShare }) {
  const [showRating, setShowRating] = useState(false);
  if (!stall) return null;

  return (
    <aside className="detail-card" aria-live="polite">
      <button className="detail-close" onClick={onClose} aria-label="關閉攤位詳情"><X size={17} /></button>
      <div className="detail-identity">
        <div className="detail-emoji" style={{ '--stall-color': stall.color }}>{stall.emoji}</div>
        <div><div className="detail-eyebrow">{stall.status === 'open' ? '現在營業中' : '今天已打烊'}</div><h3>{stall.name}</h3><p>{stall.type} · {stall.price}</p></div>
      </div>
      <div className="detail-score"><Stars rating={stall.rating} /><strong>{stall.rating.toFixed(1)}</strong><span>{stall.reviews} 則評分</span></div>
      <p className="detail-note">{stall.note}</p>
      <div className="detail-meta"><span><Clock3 size={14} />最後更新 {stall.updated}</span><span><Navigation size={14} />步行約 {Math.max(2, Math.round(stall.distance * 8))} 分鐘</span></div>
      <div className="detail-actions"><button className="detail-primary" onClick={() => setShowRating((value) => !value)}><Star size={15} />幫它評分</button><button className={`detail-secondary ${saved ? 'is-saved' : ''}`} onClick={() => onToggleSave(stall.id)}><Bookmark size={15} fill={saved ? 'currentColor' : 'none'} />{saved ? '已收藏' : '收藏'}</button><button className="detail-icon-button" onClick={() => onShare(stall)} aria-label="分享攤位"><Share2 size={16} /></button></div>
      {showRating && <div className="rating-picker"><span>你的評分</span>{[1, 2, 3, 4, 5].map((score) => <button key={score} onClick={() => { onRate(stall, score); setShowRating(false); }} aria-label={`${score} 顆星`}><Star size={20} fill="currentColor" /></button>)}</div>}
    </aside>
  );
}

function RecommendModal({ open, onClose, onSubmit }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(addStallSchema), defaultValues: { type: '主食', price: '$50–100', note: '' } });
  useEffect(() => { if (!open) reset({ type: '主食', price: '$50–100', note: '' }); }, [open, reset]);
  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="recommend-modal" role="dialog" aria-modal="true" aria-labelledby="recommend-title">
        <div className="modal-heading"><div><div className="modal-kicker"><Sparkles size={14} />共同維護地圖</div><h2 id="recommend-title">推薦一個好攤位</h2><p>把你私藏的味道，留給下一個來逛的人。</p></div><button className="modal-close" onClick={onClose} aria-label="關閉推薦表單"><X size={19} /></button></div>
        <form onSubmit={handleSubmit(onSubmit)}>
          <label className="form-field form-field-full"><span>攤位名稱</span><input {...register('name')} placeholder="例如：阿嬤的臭豆腐" />{errors.name && <small>{errors.name.message}</small>}</label>
          <div className="form-row"><label className="form-field"><span>分類</span><select {...register('type')}><option>主食</option><option>甜點</option><option>飲品</option><option>伴手禮</option></select></label><label className="form-field"><span>大約價格</span><select {...register('price')}><option>$50 以下</option><option>$50–100</option><option>$100–200</option><option>$200 以上</option></select></label></div>
          <label className="form-field form-field-full"><span>一句話推薦 <em>選填</em></span><textarea {...register('note')} placeholder="你最喜歡它的哪一點？" />{errors.note && <small>{errors.note.message}</small>}</label>
          <div className="form-tip"><Check size={15} />送出後會先標記為「社群新增」，讓大家一起補充資料。</div>
          <div className="modal-footer"><button type="button" className="text-button" onClick={onClose}>先不推薦</button><button type="submit" className="submit-button" disabled={isSubmitting}>送出推薦 <ArrowRight size={16} /></button></div>
        </form>
      </section>
    </div>
  );
}

function App() {
  const [stalls, setStalls] = useState(initialStalls);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [sort, setSort] = useState('popular');
  const [activeView, setActiveView] = useState('explore');
  const [selectedId, setSelectedId] = useState(1);
  const [saved, setSaved] = useState(() => new Set(JSON.parse(localStorage.getItem('nightmarket-saved') || '[]')));
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const selectedStall = stalls.find((stall) => stall.id === selectedId);
  const visibleStalls = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return stalls.filter((stall) => {
      const matchesCategory = category === '全部' || stall.type === category;
      const matchesView = activeView === 'explore' || saved.has(stall.id);
      const matchesQuery = !normalized || `${stall.name}${stall.type}${stall.note}`.toLowerCase().includes(normalized);
      return matchesCategory && matchesView && matchesQuery;
    }).sort((first, second) => {
      if (sort === 'nearest') return first.distance - second.distance;
      if (sort === 'rating') return second.rating - first.rating;
      if (sort === 'open') return Number(second.status === 'open') - Number(first.status === 'open');
      return second.reviews - first.reviews;
    });
  }, [activeView, category, query, saved, sort, stalls]);

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(window.nightmarketToast);
    window.nightmarketToast = window.setTimeout(() => setToast(''), 2600);
  };

  const toggleSave = (id) => {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) { next.delete(id); showToast('已從口袋名單移除'); } else { next.add(id); showToast('已加入你的口袋名單'); }
      localStorage.setItem('nightmarket-saved', JSON.stringify([...next]));
      return next;
    });
  };

  const recommend = (formData) => {
    const newStall = { id: Date.now(), name: formData.name, type: formData.type, emoji: formData.type === '甜點' ? '🍡' : formData.type === '飲品' ? '🥤' : '🍢', rating: 0, reviews: 0, distance: 0, price: formData.price, status: 'open', location: [25.0507, 121.5773], note: formData.note || '這是一個由社群剛補上的新攤位，歡迎留下第一則評價。', color: '#f2e5c8', updated: '剛剛新增' };
    setStalls((current) => [newStall, ...current]);
    setRecommendOpen(false);
    setSelectedId(newStall.id);
    showToast('謝謝你！攤位已加入地圖');
  };

  const rate = (stall, score) => {
    setStalls((current) => current.map((item) => item.id === stall.id ? { ...item, rating: item.reviews ? Number(((item.rating * item.reviews + score) / (item.reviews + 1)).toFixed(1)) : score, reviews: item.reviews + 1 } : item));
    showToast(`已留下 ${score} 顆星，謝謝你的分享`);
  };

  const share = async (stall) => {
    const shareData = { title: stall.name, text: `${stall.name}｜夜市地圖`, url: window.location.href };
    if (navigator.share) await navigator.share(shareData).catch(() => {});
    else { await navigator.clipboard?.writeText(`${stall.name}｜夜市地圖`); showToast('攤位資訊已複製'); }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="mobile-menu-button" onClick={() => setMobileNavOpen((value) => !value)} aria-label="開啟選單"><Menu size={21} /></button>
        <a className="brand" href="/" aria-label="夜市地圖首頁"><BrandMark /><span><strong>夜市地圖</strong><small>MARKET MAP</small></span></a>
        <button className="market-switcher" onClick={() => showToast('目前先提供饒河街，更多夜市即將加入')}>饒河街觀光夜市 <ChevronDown size={15} /></button>
        <label className={`search-box ${mobileSearchOpen ? 'mobile-search-open' : ''}`} onClick={() => { if (window.innerWidth <= 760) setMobileSearchOpen(true); }}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋攤位、料理或夜市…" type="search" aria-label="搜尋攤位、料理或夜市" /><kbd>⌘ K</kbd></label>
        <nav className={`top-nav ${mobileNavOpen ? 'is-open' : ''}`}><button onClick={() => { setActiveView('explore'); setMobileNavOpen(false); }}>探索</button><button onClick={() => { setActiveView('saved'); setMobileNavOpen(false); }}>我的口袋 <span>{saved.size}</span></button><button onClick={() => showToast('社群功能即將開放')}>社群</button></nav>
        <div className="header-actions"><button className="help-button" onClick={() => showToast('點選攤位可查看詳情，按書籤加入口袋名單')} aria-label="使用說明"><CircleHelp size={18} /></button><button className="recommend-button" onClick={() => setRecommendOpen(true)}><Plus size={16} />推薦攤位</button><button className="avatar" onClick={() => showToast('嗨，林同學！')} aria-label="個人檔案">林</button></div>
      </header>

      <main className="workspace">
        <aside className="explore-panel">
          <div className="panel-inner">
            <div className="panel-intro"><div className="location-line"><span className="location-pulse" />台北市 · 松山區</div><h1>{activeView === 'saved' ? '我的口袋名單' : '今晚，想吃哪一攤？'}</h1><p>{activeView === 'saved' ? `你收藏了 ${saved.size} 個想吃的攤位` : '由大家一起更新的夜市地圖，邊走邊發現。'}</p></div>
            <div className="view-tabs"><button className={activeView === 'explore' ? 'is-active' : ''} onClick={() => setActiveView('explore')}><MapIcon size={15} />探索地圖</button><button className={activeView === 'saved' ? 'is-active' : ''} onClick={() => setActiveView('saved')}><Bookmark size={15} />口袋名單 <span>{saved.size}</span></button></div>
            <div className="filter-bar"><div className="filter-label">分類</div><div className="category-scroll">{categories.map((item) => <button key={item} className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
            <div className="list-toolbar"><div><strong>{visibleStalls.length}</strong> 個攤位</div><div className="sort-menu"><span>排序</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="popular">人氣優先</option><option value="open">營業中優先</option><option value="nearest">離我最近</option><option value="rating">評分最高</option></select><ChevronDown size={13} /></div></div>
            <div className="stall-list">{visibleStalls.length ? visibleStalls.map((stall) => <StallCard key={stall.id} stall={stall} saved={saved.has(stall.id)} selected={selectedId === stall.id} onSelect={setSelectedId} onToggleSave={toggleSave} />) : <div className="empty-state"><div className="empty-icon"><Compass size={21} /></div><strong>還沒有符合的攤位</strong><p>換個關鍵字，或推薦一攤給大家。</p><button onClick={() => { setQuery(''); setCategory('全部'); setActiveView('explore'); }}>清除篩選</button></div>}</div>
            <div className="community-card"><div className="community-visual"><span>✦</span><span>✦</span><span>✦</span></div><div><div className="community-kicker">本週共同筆記</div><h2>第一次來，先逛這 3 攤</h2><p>大家最近最常收藏的饒河街路線。</p><button onClick={() => showToast('已為你整理好 3 攤路線')}>查看路線 <ArrowRight size={14} /></button></div></div>
            <footer className="panel-footer"><span><span className="footer-dot" />資料由社群共同維護</span><button onClick={() => showToast('感謝你一起讓夜市地圖更完整')}>回報錯誤</button></footer>
          </div>
        </aside>
        <MarketMap selectedId={selectedId} onSelect={setSelectedId} showToast={showToast} />
      </main>
      <StallDetail stall={selectedStall} saved={selectedStall ? saved.has(selectedStall.id) : false} onClose={() => setSelectedId(null)} onToggleSave={toggleSave} onRate={rate} onShare={share} />
      <RecommendModal open={recommendOpen} onClose={() => setRecommendOpen(false)} onSubmit={recommend} />
      {toast && <div className="toast"><Check size={15} /><span>{toast}</span></div>}
      <button className="mobile-recommend" onClick={() => setRecommendOpen(true)}><Plus size={16} />推薦攤位</button>
    </div>
  );
}

export default App;
