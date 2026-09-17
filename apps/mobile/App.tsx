import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  MapPinned,
  Plus,
  Search,
  Share2,
  Star,
  X,
} from 'lucide-react-native';
// Shared product seed data is kept outside each platform so the first prototype stays aligned.
// @ts-ignore - this small JS module is consumed by both Vite and Expo.
import { INITIAL_STALLS, MARKET_CENTER } from '../../packages/shared/src/stalls';
const filters = ['全部', '主食', '甜點', '飲品', '伴手禮'];
const stalls = INITIAL_STALLS.map((stall) => ({ ...stall, coordinate: { latitude: stall.location[0], longitude: stall.location[1] } }));
const center = { latitude: MARKET_CENTER[0], longitude: MARKET_CENTER[1] };

function Stars({ rating }: { rating: number }) {
  return <View style={styles.stars}>{[0, 1, 2, 3, 4].map((item) => <Star key={item} size={12} color="#e1a341" fill={item < Math.round(rating) ? '#e1a341' : 'transparent'} />)}</View>;
}

type MobileStall = { id: number; name: string; type: string; emoji: string; rating: number; reviews: number; price: string; note: string; color: string; coordinate: { latitude: number; longitude: number } };

function StallRow({ stall, selected, saved, onSelect, onSave }: { stall: MobileStall; selected: boolean; saved: boolean; onSelect: () => void; onSave: () => void }) {
  return (
    <Pressable style={[styles.stallRow, selected && styles.stallRowSelected]} onPress={onSelect}>
      <View style={[styles.stallEmoji, { backgroundColor: stall.color }]}><Text style={styles.emoji}>{stall.emoji}</Text><View style={styles.liveDot} /></View>
      <View style={styles.stallInfo}>
        <View style={styles.stallNameLine}><Text numberOfLines={1} style={styles.stallName}>{stall.name}</Text><Text style={styles.openText}>營業中</Text></View>
        <Text style={styles.stallType}>{stall.type} · 約 3 分鐘</Text>
        <View style={styles.ratingLine}><Stars rating={stall.rating} /><Text style={styles.ratingValue}>{stall.rating.toFixed(1)}</Text><Text style={styles.reviewCount}>({stall.reviews})</Text><Text style={styles.price}>{stall.price}</Text></View>
      </View>
      <Pressable style={styles.saveIcon} onPress={onSave} hitSlop={8}><Bookmark size={17} color={saved ? '#eb6d46' : '#9aa49f'} fill={saved ? '#eb6d46' : 'transparent'} /></Pressable>
    </Pressable>
  );
}

export default function App() {
  const [selectedId, setSelectedId] = useState<number | null>(1);
  const [filter, setFilter] = useState('全部');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<number[]>([]);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const selected = stalls.find((stall) => stall.id === selectedId);
  const visibleStalls = useMemo(() => stalls.filter((stall) => (filter === '全部' || stall.type === filter) && (!query || `${stall.name}${stall.type}${stall.note}`.includes(query))), [filter, query]);

  const toggleSave = (id: number) => setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const submitRecommendation = () => {
    if (!draftName.trim()) return;
    setRecommendOpen(false);
    setDraftName('');
    setDraftNote('');
    Alert.alert('已收到推薦', '謝謝你一起讓夜市地圖更完整！');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.brand}><View style={styles.brandMark}><MapPinned size={18} color="#fff" /></View><View><Text style={styles.brandTitle}>夜市地圖</Text><Text style={styles.brandSub}>MARKET MAP</Text></View></View>
          <Pressable style={styles.addButton} onPress={() => setRecommendOpen(true)}><Plus size={15} color="#fff" /><Text style={styles.addText}>推薦</Text></Pressable>
        </View>
        <View style={styles.searchRow}><Search size={16} color="#899490" /><TextInput value={query} onChangeText={setQuery} placeholder="搜尋攤位或料理…" placeholderTextColor="#9ba49f" style={styles.searchInput} /><Pressable onPress={() => Alert.alert('饒河街觀光夜市', '台北市松山區 · 共 52 個攤位')}><ChevronDown size={16} color="#899490" /></Pressable></View>
        <View style={styles.mapWrap}>
          <MapView style={styles.map} initialRegion={{ ...center, latitudeDelta: 0.006, longitudeDelta: 0.006 }}>
            <Circle center={center} radius={155} strokeColor="#eb6d4688" strokeWidth={1.5} fillColor="#f3b48a22" />
            {stalls.map((stall) => <Marker key={stall.id} coordinate={stall.coordinate} onPress={() => setSelectedId(stall.id)} pinColor={selectedId === stall.id ? '#202c2b' : '#eb6d46'}><View style={[styles.mapPin, selectedId === stall.id && styles.mapPinSelected]}><Text style={styles.mapPinEmoji}>{stall.emoji}</Text></View></Marker>)}
          </MapView>
          <View style={styles.mapLabel}><View style={styles.liveLabel}><View style={styles.greenDot} />正在逛</View><Text style={styles.mapTitle}>饒河街觀光夜市</Text><Text style={styles.mapSub}>6 個攤位 · 約 2 小時前有人更新</Text></View>
          <View style={styles.mapKey}><View style={styles.keyItem}><View style={styles.orangeKey} /><Text>攤位</Text></View><View style={styles.keyItem}><View style={styles.blueKey} /><Text>夜市入口</Text></View></View>
        </View>
        <View style={styles.listPanel}>
          <View style={styles.listHeading}><View><Text style={styles.listKicker}>台北市 · 松山區</Text><Text style={styles.listTitle}>今晚，想吃哪一攤？</Text></View><Pressable style={styles.miniAction} onPress={() => Alert.alert('口袋名單', `目前收藏 ${saved.length} 個攤位`)}><Bookmark size={15} color="#eb6d46" /><Text style={styles.miniActionText}>{saved.length}</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>{filters.map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filterChip, filter === item && styles.filterChipActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</ScrollView>
          <View style={styles.resultsLine}><Text style={styles.resultsCount}>{visibleStalls.length} 個攤位</Text><View style={styles.sortLine}><Text>人氣優先</Text><ChevronDown size={13} color="#899490" /></View></View>
          <FlatList data={visibleStalls} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <StallRow stall={item} selected={selectedId === item.id} saved={saved.includes(item.id)} onSelect={() => setSelectedId(item.id)} onSave={() => toggleSave(item.id)} />} showsVerticalScrollIndicator={false} contentContainerStyle={styles.stallList} />
        </View>
        {selected && <View style={styles.detailCard}><Pressable style={styles.detailClose} onPress={() => setSelectedId(null)}><X size={16} color="#899490" /></Pressable><View style={styles.detailHead}><View style={[styles.detailEmoji, { backgroundColor: selected.color }]}><Text style={styles.detailEmojiText}>{selected.emoji}</Text></View><View style={styles.detailCopy}><Text style={styles.detailStatus}>現在營業中</Text><Text style={styles.detailName}>{selected.name}</Text><Text style={styles.detailType}>{selected.type} · {selected.price}</Text></View></View><View style={styles.detailScore}><Stars rating={selected.rating} /><Text style={styles.detailRating}>{selected.rating.toFixed(1)}</Text><Text style={styles.detailReviews}>{selected.reviews} 則評分</Text></View><Text style={styles.detailNote}>{selected.note}</Text><View style={styles.detailButtons}><Pressable style={styles.rateButton} onPress={() => Alert.alert('留下評分', '評分功能將在登入後開放。')}><Star size={15} color="#fff" /><Text style={styles.rateText}>幫它評分</Text></Pressable><Pressable style={styles.saveButton} onPress={() => toggleSave(selected.id)}><Bookmark size={15} color="#eb6d46" fill={saved.includes(selected.id) ? '#eb6d46' : 'transparent'} /><Text style={styles.saveText}>{saved.includes(selected.id) ? '已收藏' : '收藏'}</Text></Pressable><Pressable style={styles.shareButton} onPress={() => Alert.alert('分享攤位', selected.name)}><Share2 size={15} color="#899490" /></Pressable></View></View>}
        <Modal visible={recommendOpen} animationType="slide" transparent onRequestClose={() => setRecommendOpen(false)}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHeading}><View><Text style={styles.modalKicker}>共同維護地圖</Text><Text style={styles.modalTitle}>推薦一個好攤位</Text><Text style={styles.modalSub}>把你私藏的味道，留給下一個來逛的人。</Text></View><Pressable onPress={() => setRecommendOpen(false)}><X size={20} color="#899490" /></Pressable></View><Text style={styles.inputLabel}>攤位名稱</Text><TextInput value={draftName} onChangeText={setDraftName} placeholder="例如：阿嬤的臭豆腐" placeholderTextColor="#9ba49f" style={styles.modalInput} /><Text style={styles.inputLabel}>一句話推薦 <Text style={styles.optional}>選填</Text></Text><TextInput value={draftNote} onChangeText={setDraftNote} placeholder="你最喜歡它的哪一點？" placeholderTextColor="#9ba49f" multiline style={[styles.modalInput, styles.noteInput]} /><View style={styles.tip}><Check size={15} color="#367d8d" /><Text style={styles.tipText}>送出後會先標記為社群新增。</Text></View><View style={styles.modalFooter}><Pressable onPress={() => setRecommendOpen(false)}><Text style={styles.cancelText}>先不推薦</Text></Pressable><Pressable style={styles.submitButton} onPress={submitRecommendation}><Text style={styles.submitText}>送出推薦</Text><ArrowRight size={15} color="#fff" /></Pressable></View></View></View></Modal>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fffdf8' },
  container: {
    flex: 1,
    backgroundColor: '#f8f6f0',
  },
  header: { height: 58, paddingHorizontal: 18, backgroundColor: '#fffdf8', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e1d8' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 32, height: 32, backgroundColor: '#eb6d46', borderRadius: 10, borderBottomLeftRadius: 3, alignItems: 'center', justifyContent: 'center' },
  brandTitle: { color: '#202c2b', fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  brandSub: { color: '#899490', fontSize: 7, letterSpacing: 2, fontWeight: '700', marginTop: 1 },
  addButton: { height: 34, paddingHorizontal: 12, backgroundColor: '#eb6d46', borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 4 },
  addText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  searchRow: { margin: 12, height: 40, paddingHorizontal: 11, backgroundColor: '#f0ede6', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, color: '#202c2b', fontSize: 12, paddingVertical: 0 },
  mapWrap: { height: '42%', minHeight: 270, position: 'relative', overflow: 'hidden' },
  map: { flex: 1 },
  mapLabel: { position: 'absolute', left: 14, top: 13, padding: 11, backgroundColor: '#fffdf8ee', borderRadius: 11, minWidth: 205 },
  liveLabel: { color: '#c75332', fontSize: 10, fontWeight: '800', flexDirection: 'row', alignItems: 'center', gap: 6 },
  greenDot: { width: 6, height: 6, backgroundColor: '#46a36c', borderRadius: 3 },
  mapTitle: { color: '#202c2b', fontSize: 16, fontWeight: '800', marginTop: 3 },
  mapSub: { color: '#899490', fontSize: 9, marginTop: 2 },
  mapKey: { position: 'absolute', bottom: 12, left: 14, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fffdf8ee', borderRadius: 8, flexDirection: 'row', gap: 12 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  orangeKey: { width: 7, height: 7, backgroundColor: '#eb6d46', borderRadius: 4 },
  blueKey: { width: 7, height: 7, backgroundColor: '#367d8d', borderRadius: 4 },
  keyItemText: { color: '#52615e', fontSize: 9 },
  mapPin: { width: 38, height: 38, backgroundColor: '#eb6d46', borderWidth: 3, borderColor: '#fffdf8', borderRadius: 20, borderBottomLeftRadius: 5, alignItems: 'center', justifyContent: 'center', shadowColor: '#202c2b', shadowOpacity: .2, shadowRadius: 4, shadowOffset: { width: 0, height: 3 } },
  mapPinSelected: { backgroundColor: '#202c2b', transform: [{ scale: 1.18 }] },
  mapPinEmoji: { fontSize: 18 },
  listPanel: { flex: 1, paddingHorizontal: 15, paddingTop: 16, backgroundColor: '#fffdf8', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listKicker: { color: '#c75332', fontSize: 10, fontWeight: '800' },
  listTitle: { color: '#202c2b', fontSize: 20, fontWeight: '800', letterSpacing: -0.7, marginTop: 4 },
  miniAction: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, backgroundColor: '#fff0e8', borderRadius: 8 },
  miniActionText: { color: '#c75332', fontSize: 11, fontWeight: '800' },
  filterScroll: { gap: 6, paddingVertical: 14 },
  filterChip: { height: 29, paddingHorizontal: 11, borderWidth: 1, borderColor: '#e2ded5', borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  filterChipActive: { backgroundColor: '#202c2b', borderColor: '#202c2b' },
  filterText: { color: '#52615e', fontSize: 10, fontWeight: '700' },
  filterTextActive: { color: '#fffdf8' },
  resultsLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  resultsCount: { color: '#202c2b', fontSize: 12, fontWeight: '800' },
  sortLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stallList: { gap: 7, paddingBottom: 110 },
  stallRow: { minHeight: 70, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fcfaf5', borderWidth: 1, borderColor: 'transparent', borderRadius: 12 },
  stallRowSelected: { backgroundColor: '#fff', borderColor: '#f0d5c8' },
  stallEmoji: { width: 54, height: 54, borderRadius: 11, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  emoji: { fontSize: 24 },
  liveDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: '#46a36c', borderWidth: 2, borderColor: '#fffdf8', right: 5, top: 5 },
  stallInfo: { minWidth: 0, flex: 1 },
  stallNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stallName: { color: '#202c2b', flexShrink: 1, fontSize: 12, fontWeight: '800' },
  openText: { color: '#3c9868', fontSize: 9, fontWeight: '700' },
  stallType: { color: '#899490', fontSize: 9, marginTop: 3, marginBottom: 5 },
  ratingLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stars: { flexDirection: 'row', gap: 1 },
  ratingValue: { color: '#202c2b', fontSize: 10, fontWeight: '800' },
  reviewCount: { color: '#899490', fontSize: 9 },
  price: { color: '#9f7656', fontSize: 9, marginLeft: 'auto' },
  saveIcon: { width: 28, height: 31, alignItems: 'center', justifyContent: 'center' },
  detailCard: { position: 'absolute', left: 15, right: 15, bottom: 15, padding: 16, backgroundColor: '#fffdf8', borderRadius: 15, shadowColor: '#202c2b', shadowOpacity: .2, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  detailClose: { position: 'absolute', top: 11, right: 11, width: 27, height: 27, backgroundColor: '#f1eee6', borderRadius: 8, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  detailHead: { flexDirection: 'row', gap: 10, paddingRight: 24 },
  detailEmoji: { width: 53, height: 53, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  detailEmojiText: { fontSize: 27 },
  detailCopy: { justifyContent: 'center' },
  detailStatus: { color: '#3c9868', fontSize: 9, fontWeight: '800' },
  detailName: { color: '#202c2b', fontSize: 17, fontWeight: '800', marginTop: 2 },
  detailType: { color: '#899490', fontSize: 10, marginTop: 1 },
  detailScore: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: '#e5e1d8', marginTop: 14, paddingTop: 12 },
  detailRating: { color: '#202c2b', fontSize: 17, fontWeight: '800' },
  detailReviews: { color: '#899490', fontSize: 10 },
  detailNote: { color: '#52615e', fontSize: 11, lineHeight: 17, borderLeftWidth: 3, borderLeftColor: '#efbd62', paddingLeft: 10, marginVertical: 10 },
  detailButtons: { flexDirection: 'row', gap: 6 },
  rateButton: { height: 35, flex: 1, backgroundColor: '#202c2b', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  rateText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  saveButton: { height: 35, flex: 1, backgroundColor: '#fff0e8', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  saveText: { color: '#c75332', fontSize: 10, fontWeight: '800' },
  shareButton: { height: 35, width: 35, backgroundColor: '#f1eee6', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: '#202c2b88', justifyContent: 'flex-end' },
  modal: { padding: 22, backgroundColor: '#fffdf8', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 20 },
  modalKicker: { color: '#c75332', fontSize: 10, fontWeight: '800' },
  modalTitle: { color: '#202c2b', fontSize: 23, fontWeight: '800', marginTop: 5 },
  modalSub: { color: '#899490', fontSize: 11, marginTop: 3 },
  inputLabel: { color: '#202c2b', fontSize: 11, fontWeight: '800', marginTop: 19, marginBottom: 6 },
  optional: { color: '#899490', fontWeight: '400' },
  modalInput: { height: 43, paddingHorizontal: 12, color: '#202c2b', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dfdbd2', borderRadius: 9, fontSize: 12 },
  noteInput: { height: 76, paddingTop: 11, textAlignVertical: 'top' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 9, marginTop: 16, backgroundColor: '#e6f0f0', borderRadius: 8 },
  tipText: { color: '#367d8d', fontSize: 10 },
  modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 21 },
  cancelText: { color: '#899490', fontSize: 11, fontWeight: '700' },
  submitButton: { height: 40, paddingHorizontal: 14, backgroundColor: '#eb6d46', borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  submitText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
