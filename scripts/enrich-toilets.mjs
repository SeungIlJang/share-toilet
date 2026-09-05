/**
 * 전국공중화장실 CSV + 지오코딩 캐시 → src/assets/data.json (전국, 상세정보 포함)
 *
 * 사용법:
 *   1. data/ 에 CSV 를 넣는다
 *   2. node scripts/geocode-toilets.mjs   (주소 → 좌표, 최초 1회 · 재개 가능)
 *   3. npm run data:build                 (이 스크립트)
 *
 * - 전국 모든 도시 포함, 서울 여부는 sido 로 구분
 * - 정보창이 인식하는 필드: openHour, unisex, menToilet, womenToilet, disabled, diaper, tel
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsvText, parseCsv, makeColFinder, pickAddress } from './lib/csv.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CACHE_FILE = path.join(DATA_DIR, '.geocode-cache.json');
const OUT_FILE = path.join(ROOT, 'public/data.json'); // 런타임 fetch (JS 번들에 포함 안 함)
const VER_FILE = path.join(ROOT, 'public/data-version.json'); // 원격 갱신 감지용 버전

// 표준 시/도 (원본 오기 정규화용)
const SIDO_LIST = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
  '세종특별자치시', '경기도', '강원특별자치도', '강원도', '충청북도', '충청남도',
  '전북특별자치도', '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

function fail(m) { console.error(`❌ ${m}`); process.exit(1); }

function findCsv() {
  if (!fs.existsSync(DATA_DIR)) fail('data/ 폴더가 없습니다.');
  const csvs = fs.readdirSync(DATA_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .map((f) => ({ f, m: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!csvs.length) fail('data/ 안에 .csv 파일이 없습니다.');
  return path.join(DATA_DIR, csvs[0].f);
}

const num = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
const yes = (v) => /^(Y|y|1|있음|설치|공용|가능|유)/.test(String(v ?? '').trim());
const clean = (v) => (String(v ?? '').trim() || null);

// 주소에서 시/도, 시군구, 읍면동 파싱 (표준 시/도만 인식)
function parseRegion(jibun, road) {
  const src = String(jibun || road || '');
  const sido = SIDO_LIST.find((s) => src.startsWith(s)) || '';
  const rest = sido ? src.slice(sido.length).trim() : src;
  const sigungu = (rest.match(/(\S+?(?:시|군|구))(?:\s|$)/) || [])[1] || '';
  const afterGu = sigungu ? rest.slice(rest.indexOf(sigungu) + sigungu.length).trim() : rest;
  const dong = (afterGu.match(/(\S+?(?:동|읍|면|가|리))(?:\s|\d|$)/) || [])[1] || '';
  const address = [sigungu, dong].filter(Boolean).join(' ');
  return { sido, sigungu, dong, address };
}

function main() {
  const file = findCsv();
  console.log(`📄 CSV: ${path.relative(ROOT, file)}`);

  const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
  if (!Object.keys(cache).length) {
    console.warn('⚠️  지오코딩 캐시가 비어 있습니다. 먼저 `node scripts/geocode-toilets.mjs` 를 실행하세요.');
  }

  const rows = parseCsv(readCsvText(file));
  const header = rows[0];
  const col = makeColFinder(header);
  const idx = {
    name: col('화장실명', '위생시설명'),
    road: col('소재지도로명주소', '도로명주소'),
    jibun: col('소재지지번주소', '지번주소'),
    unisex: col('남녀공용화장실여부', '남녀공용'),
    men: col('남성용대변기수'),
    women: col('여성용대변기수'),
    menDis: col('남성용장애인용대변기수'),
    womenDis: col('여성용장애인용대변기수'),
    diaper: col('기저귀교환대유무', '기저귀교환대설치여부', '기저귀교환대'),
    tel: col('전화번호'),
    open: col('개방시간상세', '개방시간'),
  };

  const out = [];
  let noCoord = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const addr = pickAddress(r[idx.road], r[idx.jibun]);
    const coord = cache[addr];
    if (!coord || !coord.lat || !coord.lng) { noCoord++; continue; }

    const { sido, dong, address } = parseRegion(r[idx.jibun], r[idx.road]);
    const name = clean(r[idx.name]) || `${address || '공중'} 화장실`;
    const disabled = (num(r[idx.menDis]) || 0) + (num(r[idx.womenDis]) || 0) > 0;

    // null/빈 값은 제거해 파일 크기 절감
    const rec = {
      id: String(out.length + 1),
      title: name,
      latitude: coord.lat,
      longitude: coord.lng,
      address,
      sido,
      newAddress: clean(r[idx.road]),
      openHour: clean(r[idx.open]),
      unisex: idx.unisex !== -1 ? yes(r[idx.unisex]) : null,
      menToilet: num(r[idx.men]),
      womenToilet: num(r[idx.women]),
      disabled: disabled || null,
      diaper: idx.diaper !== -1 ? yes(r[idx.diaper]) : null,
      tel: clean(r[idx.tel]),
    };
    for (const k of Object.keys(rec)) {
      if (rec[k] === null || rec[k] === undefined || rec[k] === '') delete rec[k];
    }
    out.push(rec);
  }

  if (!out.length) fail('저장할 레코드가 없습니다. 지오코딩 캐시를 확인하세요.');

  fs.writeFileSync(OUT_FILE, JSON.stringify(out), 'utf8');

  // 원격 갱신 감지용 버전 파일 (v = 생성 시각, 앱이 로컬 vs 원격 비교에 사용)
  const now = new Date();
  fs.writeFileSync(VER_FILE, JSON.stringify({
    v: now.getTime(),
    updatedAt: now.toISOString(),
    count: out.length,
  }), 'utf8');

  const seoul = out.filter((o) => o.sido === '서울특별시').length;
  console.log(`✅ 완료: ${out.length}건 저장 (서울 ${seoul} · 좌표없음 제외 ${noCoord})`);
  console.log(`   → ${path.relative(ROOT, OUT_FILE)}  (${(fs.statSync(OUT_FILE).size / 1e6).toFixed(1)} MB)`);
  console.log(`   → ${path.relative(ROOT, VER_FILE)}  (v=${now.getTime()})`);
  const s = out.find((o) => o.openHour) || out[0];
  console.log(`   예시: ${s.title} | ${s.sido} | 개방:${s.openHour ?? '-'} | 남${s.menToilet ?? '-'}/여${s.womenToilet ?? '-'} | 장애인:${s.disabled ? 'O' : '-'} | 기저귀:${s.diaper ? 'O' : '-'} | ☎${s.tel ?? '-'}`);
}

main();
