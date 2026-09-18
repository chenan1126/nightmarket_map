import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const CITY_CENTERS = {
  臺北市: [25.04, 121.52],
  新北市: [25.01, 121.46],
  桃園市: [24.99, 121.30],
  臺中市: [24.15, 120.67],
  臺南市: [22.99, 120.20],
  花蓮縣: [23.99, 121.60],
  臺東縣: [22.76, 121.14],
};

function MapCenter({ city, userLocation, markets, onSelect }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(userLocation || CITY_CENTERS[city] || [23.7, 120.9], userLocation ? 12 : 8, { duration: 0.45 });
  }, [map, city, userLocation]);

  return (
    <>
      {markets
        .filter((item) => item.latitude != null && (city === '全部' || item.city === city))
        .map((item) => (
          <CircleMarker
            key={item.id}
            center={[item.latitude, item.longitude]}
            radius={9}
            pathOptions={{ color: '#fffdf8', weight: 3, fillColor: '#df6c43', fillOpacity: 1 }}
            eventHandlers={{ click: () => onSelect(item) }}
          >
            <title>{item.name}</title>
          </CircleMarker>
        ))}
      {userLocation && <CircleMarker center={userLocation} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#367d8d', fillOpacity: 1 }} />}
    </>
  );
}

function MapResizeOnVisible() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const refresh = () => {
      if (container.clientWidth && container.clientHeight) map.invalidateSize({ pan: false });
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(container);
    const frame = window.requestAnimationFrame(refresh);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [map]);

  return null;
}

export default function LazyMarketMap({ city, userLocation, markets, onSelect }) {
  return (
    <MapContainer center={[23.7, 120.9]} zoom={7} zoomControl={false} scrollWheelZoom>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapResizeOnVisible />
      <MapCenter city={city} userLocation={userLocation} markets={markets} onSelect={onSelect} />
    </MapContainer>
  );
}
