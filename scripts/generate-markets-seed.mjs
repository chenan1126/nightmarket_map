import { readFileSync } from 'node:fs';

const source = JSON.parse(readFileSync(new URL('../public/data/night-markets.json', import.meta.url)));
const quote = (value) => value == null || value === '' ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const number = (value) => Number.isFinite(value) ? String(value) : 'null';

console.log('-- Generated from public/data/night-markets.json.');
console.log('-- Candidates remain needs_review until independently checked.');
console.log('insert into public.markets (external_id, name, city, district, address, latitude, longitude, status, source_url, source_date) values');
console.log(source.markets.map((market) => `(${quote(market.id)}, ${quote(market.name)}, ${quote(market.city)}, ${quote(market.district)}, ${quote(market.address)}, ${number(market.latitude)}, ${number(market.longitude)}, 'needs_review', 'https://data.gov.tw/dataset/95760', null)`).join(',\n'));
console.log('on conflict (external_id) do update set name = excluded.name, city = excluded.city, district = excluded.district, address = excluded.address, latitude = excluded.latitude, longitude = excluded.longitude, status = excluded.status, source_url = excluded.source_url, source_date = excluded.source_date;');
