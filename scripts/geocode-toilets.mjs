/**
 * 주소 → 좌표(WGS84) 지오코딩 (네이버 지도 Geocoding API)
 *
 * - data/*.csv 의 주소를 지오코딩해 data/.geocode-cache.json 에 저장
 * - 재개 가능(캐시된 주소는 건너뜀), 동시성 제한, 실패 재시도
 * - 환경변수(.env): VITE_NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 *
 * 사용:
 *   node scripts/geocode-toilets.mjs            # 전체
 *   LIMIT=50 node scripts/geocode-toilets.mjs   # 앞 50건만(테스트)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsvText, parseCsv, makeColFinder, readEnv, pickAddress } from './lib/csv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CACHE_FILE = path.join(DATA_DIR, '.geocode-cache.json');

const ENDPOINT = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';
const CONCURRENCY = 8;
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity;

function fail(m) { console.error(`❌ ${m}`); process.exit(1); }

function findCsv() {
  const csvs = fs.readdirSync(DATA_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .map((f) => ({ f, m: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!csvs.length) fail('data/ 에 .csv 가 없습니다.');
  return path.join(DATA_DIR, csvs[0].f);
}

// CI 환경변수(process.env) 우선, 없으면 .env 파일
const fileEnv = readEnv(path.join(ROOT, '.env'));
const CID = process.env.VITE_NAVER_CLIENT_ID || fileEnv.VITE_NAVER_CLIENT_ID;
const SEC = process.env.NAVER_CLIENT_SECRET || fileEnv.NAVER_CLIENT_SECRET;
if (!CID || !SEC) fail('VITE_NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 가 필요합니다 (.env 또는 환경변수).');

async function geocode(address, attempt = 0) {
  try {
    const url = `${ENDPOINT}?query=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { 'x-ncp-apigw-api-key-id': CID, 'x-ncp-apigw-api-key': SEC },
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const a = json.addresses && json.addresses[0];
    if (!a) return null; // 결과 없음
    return { lat: parseFloat(a.y), lng: parseFloat(a.x) };
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      return geocode(address, attempt + 1);
    }
    return undefined; // 재시도 실패(다음 실행에서 다시 시도하도록 캐시 안 함)
  }
}

async function main() {
  const file = findCsv();
  console.log(`📄 CSV: ${path.relative(ROOT, file)}`);
  const rows = parseCsv(readCsvText(file));
  const header = rows[0];
  const col = makeColFinder(header);
  const iRoad = col('소재지도로명주소', '도로명주소');
  const iJibun = col('소재지지번주소', '지번주소');
  if (iRoad === -1 && iJibun === -1) fail('주소 컬럼을 찾지 못했습니다.');

  // 유니크 주소 수집
  const addrSet = new Set();
  for (let i = 1; i < rows.length && addrSet.size < LIMIT; i++) {
    const addr = pickAddress(rows[i][iRoad], rows[i][iJibun]);
    if (addr) addrSet.add(addr);
  }
  const addresses = [...addrSet];

  const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
  const todo = addresses.filter((a) => !(a in cache));
  console.log(`총 유니크 주소 ${addresses.length}건 · 캐시됨 ${addresses.length - todo.length}건 · 처리 대상 ${todo.length}건`);
  if (!todo.length) { console.log('✅ 모두 캐시됨. 지오코딩 불필요.'); return; }

  let done = 0, ok = 0, empty = 0, next = 0;
  const save = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');

  async function worker() {
    while (next < todo.length) {
      const addr = todo[next++];
      const r = await geocode(addr);
      if (r !== undefined) { cache[addr] = r; if (r) ok++; else empty++; } // null=결과없음도 캐시
      done++;
      if (done % 200 === 0) { save(); process.stdout.write(`\r  진행 ${done}/${todo.length} (성공 ${ok}, 결과없음 ${empty})   `); }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  save();
  console.log(`\n✅ 지오코딩 완료: 성공 ${ok} · 결과없음 ${empty} · 총 캐시 ${Object.keys(cache).length}건`);
  console.log(`   → ${path.relative(ROOT, CACHE_FILE)}`);
}

main();
