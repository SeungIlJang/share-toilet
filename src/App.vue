<script setup>
import NaverMapMarker from "@/components/NaverMapMarker.vue";
import { ref, onMounted, computed } from 'vue';
import { toiletsData } from './assets/data.js';
import { getCurrentPosition } from './utils/geolocation.js';
import { loadStatus, saveStatus } from './utils/statusStore.js';
import { CAR_CAMPING_OPTIONS, withCarCampingInfo } from './utils/carCamping.js';
import { initializeAdMob } from './services/adMob.js';

// 화장실 상태 옵션 (사용자 표시, 파일로 저장)
const STATUS_OPTIONS = [
  { key: 'available', label: '사용가능', color: '#2e7d32' },
  { key: 'password', label: '비번필요', color: '#ef6c00' },
  { key: 'locked', label: '잠김', color: '#c62828' },
  { key: 'unavailable', label: '사용못함', color: '#616161' },
];
// { [id]: { counts: { [statusKey]: n }, my: statusKey|null } }  (1인 1표 투표)
const toiletStatus = ref({});

// 구버전(문자열) → 신버전(투표 객체) 마이그레이션
const migrateStatus = (raw) => {
  const out = {};
  for (const [id, v] of Object.entries(raw || {})) {
    if (typeof v === 'string') out[id] = { counts: { [v]: 1 }, my: v };
    else if (v && typeof v === 'object') out[id] = { counts: v.counts || {}, my: v.my ?? null };
  }
  return out;
};

// 투표: 같은 걸 다시 누르면 취소, 다른 걸 누르면 기존 표 -1 / 새 표 +1 (1인 1표)
const voteStatus = ({ id, status }) => {
  const cur = toiletStatus.value[id] || { counts: {}, my: null };
  const counts = { ...cur.counts };
  let my = cur.my;
  if (my === status) {
    counts[status] = Math.max(0, (counts[status] || 0) - 1);
    my = null;
  } else {
    if (my) counts[my] = Math.max(0, (counts[my] || 0) - 1);
    counts[status] = (counts[status] || 0) + 1;
    my = status;
  }
  Object.keys(counts).forEach((k) => { if (!counts[k]) delete counts[k]; });

  const next = { ...toiletStatus.value };
  if (!my && !Object.keys(counts).length) delete next[id];
  else next[id] = { counts, my };
  toiletStatus.value = next;
  saveStatus(next);
};

// 목록 배지용: 내가 누른(최근) 상태 옵션 + 카운트
const statusInfo = (id) => {
  const rec = toiletStatus.value[id];
  if (!rec || !rec.my) return null;
  const opt = STATUS_OPTIONS.find((o) => o.key === rec.my);
  return opt ? { ...opt, count: rec.counts?.[rec.my] || 0 } : null;
};

// ── 환경변수 ──────────────────────────────────────────────
const SEOUL_API_KEY = import.meta.env.VITE_SEOUL_API_KEY;
const USE_LIVE_API = import.meta.env.VITE_USE_LIVE_API === 'true';
const SEOUL_SERVICE = import.meta.env.VITE_SEOUL_TOILET_SERVICE || 'GeoInfoPublicToiletWGS';
const DEFAULT_RADIUS = Number(import.meta.env.VITE_DEFAULT_RADIUS) || 1000;

// 서울시청 기본 좌표 (위치 권한 거부 시 대체)
const DEFAULT_POSITION = { latitude: 37.5666805, longitude: 126.9784147 };

// 반경 선택 옵션 (m)
const RADIUS_OPTIONS = [300, 500, 1000, 2000, 3000];

// ── 상태 ─────────────────────────────────────────────────
const locations = ref([]);        // 전체 화장실 데이터
const selectedToiletId = ref(null);
const searchQuery = ref('');
const isLoading = ref(false);
const isLocating = ref(false);
const centerLocation = ref(null);
const userPosition = ref(null);   // 사용자의 실제 현재 위치
const searchOrigin = ref(null);   // 반경 검색 기준점 (내 위치 또는 '이 근처 검색' 지점)
const searchRadius = ref(DEFAULT_RADIUS);
const mode = ref('search');       // 'search' | 'near'
const pendingRegion = ref(null);  // 지도 이동 후 검색 대기 중인 중심 좌표
const showSearchAreaBtn = ref(false); // '이 근처 검색' 버튼 노출 여부
const sheetExpanded = ref(false); // 하단 목록 시트 펼침 여부 (모바일)
const carCampingFilter = ref('all'); // 차박 편의정보 필터
const showCarCampingFilters = ref(false); // 필요할 때만 차박 조회조건 펼침

// ── 유틸 ─────────────────────────────────────────────────
// 두 좌표 간의 거리 계산 (Haversine formula, km)
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // 지구 반지름 (km)
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const deg2rad = (deg) => deg * (Math.PI / 180);

// 거리 표기 (1km 미만은 m, 이상은 km)
const formatDistance = (km) => {
  if (km == null) return '';
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
};

// 검색 기준점(searchOrigin)으로부터의 거리를 부여
const withDistance = (list) => {
  if (!searchOrigin.value) return list.map((l) => ({ ...l, distance: null }));
  const { latitude, longitude } = searchOrigin.value;
  return list.map((l) => ({
    ...l,
    distance: getDistanceFromLatLonInKm(latitude, longitude, l.latitude, l.longitude),
  }));
};

// 한글 검색어 유효성 검사
const isValidKoreanSearch = (text) => {
  const koreanPattern = /[가-힣]/g;
  return (text.match(koreanPattern) || []).length >= 2;
};

// ── 목록 계산 ────────────────────────────────────────────
// '내 주변' 모드: 반경 내 화장실을 가까운 순으로
const nearbyLocations = computed(() => {
  if (!searchOrigin.value) return [];
  return withDistance(locations.value)
    .filter((l) => l.distance != null && l.distance <= searchRadius.value / 1000)
    .sort((a, b) => a.distance - b.distance);
});

// '검색' 모드: 구/동/주소 매칭 (위치를 알면 가까운 순 정렬)
const searchResults = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query || !isValidKoreanSearch(query)) return [];

  const filtered = locations.value.filter((location) =>
    location.title.toLowerCase().includes(query) ||
    location.address.toLowerCase().includes(query) ||
    (location.newAddress && location.newAddress.toLowerCase().includes(query))
  );

  const withDist = withDistance(filtered);
  return searchOrigin.value
    ? withDist.sort((a, b) => a.distance - b.distance)
    : withDist;
});

// 지도/목록에 실제로 표시할 데이터
const displayedLocations = computed(() => {
  const base = mode.value === 'near' ? nearbyLocations.value : searchResults.value;
  if (carCampingFilter.value === 'all') return base;
  return base.filter((location) => location.carCamping?.key === carCampingFilter.value);
});

// 검색 상태 메시지
const searchStatus = computed(() => {
  if (isLoading.value) return '데이터를 불러오는 중...';
  if (mode.value === 'near') {
    return isLocating.value
      ? '현재 위치를 확인하는 중...'
      : `반경 ${formatDistance(searchRadius.value / 1000)} 내 ${displayedLocations.value.length}개`;
  }
  if (!searchQuery.value) return '구나 동 이름을 입력하세요';
  if (!isValidKoreanSearch(searchQuery.value)) return '한글 2글자 이상 입력하세요';
  return `검색결과: ${displayedLocations.value.length}개`;
});

// ── 데이터 조회 ───────────────────────────────────────────
// 서울 열린데이터 API 에서 공중화장실 조회 (개발 서버 프록시 /seoul-api 경유)
// 실시간 서버가 응답 없거나 오류면 빠르게 실패시켜 data.json 으로 폴백
const fetchFromSeoulApi = async () => {
  const pageSize = 1000;
  const all = [];
  let page = 1;

  while (page <= 20) { // 안전장치: 최대 20페이지
    const start = (page - 1) * pageSize + 1;
    const end = page * pageSize;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000); // 4초 타임아웃
    let res;
    try {
      res = await fetch(`/seoul-api/${SEOUL_API_KEY}/xml/${SEOUL_SERVICE}/${start}/${end}/`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const xmlDoc = new DOMParser().parseFromString(await res.text(), 'text/xml');
    // 서울시 오류 응답(RESULT/CODE) 감지 → 폴백
    const code = xmlDoc.getElementsByTagName('CODE')[0]?.textContent;
    if (code && !/INFO-000/.test(code)) throw new Error(`서울 API 오류: ${code}`);
    const rows = xmlDoc.getElementsByTagName('row');

    const pageLocations = Array.from(rows)
      .map((row, index) => mapSeoulRow(row, start + index))
      .filter(Boolean);

    all.push(...pageLocations);
    if (rows.length < pageSize) break; // 마지막 페이지
    page++;
  }

  if (!all.length) throw new Error('API 결과가 비어 있습니다');
  return all;
};

// <row> 자식 태그를 자동 인식해 표준 스키마로 매핑
// (서비스가 바뀌어 컬럼명이 달라도 대응 — VITE_SEOUL_TOILET_SERVICE 만 교체하면 됨)
// 자오선 호장 (Transverse Mercator 보조)
const meridArc = (lat, a, e2) => a * (
  (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * lat
  - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * lat)
  + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * lat)
  - (35 * e2 ** 3 / 3072) * Math.sin(6 * lat)
);

// EPSG:5179 (UTM-K, GRS80) 투영좌표 → WGS84 위/경도 역변환
const utmkToLatLng = (x, y) => {
  const a = 6378137.0, f = 1 / 298.257222101;
  const k0 = 0.9996, lat0 = 38 * Math.PI / 180, lon0 = 127.5 * Math.PI / 180;
  const FE = 1000000, FN = 2000000;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const M = meridArc(lat0, a, e2) + (y - FN) / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const lat1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(lat1), c = Math.cos(lat1), t = Math.tan(lat1);
  const C1 = ep2 * c ** 2, T1 = t ** 2;
  const N1 = a / Math.sqrt(1 - e2 * s ** 2);
  const R1 = a * (1 - e2) / (1 - e2 * s ** 2) ** 1.5;
  const D = (x - FE) / (N1 * k0);
  const lat = lat1 - (N1 * t / R1) * (
    D ** 2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720
  );
  const lon = lon0 + (
    D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120
  ) / c;
  return { lat: lat * 180 / Math.PI, lng: lon * 180 / Math.PI };
};

// '|' 구분 값 정리 (예: "상시(24시간)|" → "상시(24시간)", "기타|04:00~22:00|" → "기타 04:00~22:00")
const cleanPipe = (v) => String(v || '').replace(/\|+$/, '').replace(/\s*\|\s*/g, ' ').trim();

// mgisToiletPoi 레코드(대문자 키 객체) → 표준 스키마 (실시간 XML·폴백 JSON 공용)
// 컬럼: OBJECTID, ADDR_NEW(도로명), ADDR_OLD(지번), COORD_X(경도)/COORD_Y(위도),
//       CONTS_NAME(건물명), GU_NAME(구), TEL_NO, VALUE_02(개방시간), VALUE_05(장애인), VALUE_06(편의시설)
const mapSeoulRecord = (f, seq) => {
  const cx = parseFloat(f.COORD_X), cy = parseFloat(f.COORD_Y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  // COORD_X/Y 는 WGS84 경위도(경도 127.x / 위도 37.x). 혹시 투영좌표면 UTM-K 로 변환.
  let lat, lng;
  if (Math.abs(cx) <= 180 && Math.abs(cy) <= 90) { lng = cx; lat = cy; }
  else ({ lat, lng } = utmkToLatLng(cx, cy));
  if (!(lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132)) return null; // 한국 밖 → 무효

  const gu = f.GU_NAME || '';
  const dong = (String(f.ADDR_OLD || '').match(/(\S+?(?:동|가|읍|면|리))(?:\s|\d|$)/) || [])[1] || '';

  return {
    id: String(f.OBJECTID || seq || ''),
    title: f.CONTS_NAME || `${gu} ${dong} 공중화장실`.trim(),
    latitude: lat,
    longitude: lng,
    address: [gu, dong].filter(Boolean).join(' '),
    sido: '서울특별시',
    newAddress: String(f.ADDR_NEW || '').trim() || null,
    openHour: cleanPipe(f.VALUE_02) || null,
    disabled: /(남|여|공용)/.test(f.VALUE_05 || '') ? true : null,
    diaper: /기저귀/.test(f.VALUE_06 || '') ? true : null,
    tel: String(f.TEL_NO || '').trim() || null,
  };
};

// 실시간 XML <row> → 표준 스키마
const mapSeoulRow = (row, seq) => {
  const f = {};
  for (const el of row.children) f[el.tagName.toUpperCase()] = (el.textContent || '').trim();
  return mapSeoulRecord(f, seq);
};

// 폴백 JSON 항목(소문자 키) → 표준 스키마
const mapSeoulObject = (item, seq) => {
  const f = {};
  for (const k of Object.keys(item)) f[k.toUpperCase()] = item[k];
  return mapSeoulRecord(f, seq);
};

// 서울 폴백: data/seoun_public_toilet_location.json (동적 import → 별도 청크, 필요 시에만 로드)
const loadSeoulFallback = async () => {
  const { default: raw } = await import('../data/seoun_public_toilet_location.json');
  const rows = Array.isArray(raw) ? raw : (raw.DATA || []);
  return rows.map((item, i) => mapSeoulObject(item, i)).filter(Boolean);
};

const SEOUL_SIDO = '서울특별시';

/**
 * 데이터 조회 아키텍처
 * - 서울: 실시간 API(mgisToiletPoi) → 실패 시 서울 폴백 JSON(seoun_public_toilet_location.json)
 * - 다른 도시: 전국 data.json
 * - 최후: 전체 data.json
 */
const fetchToilets = async () => {
  isLoading.value = true;
  try {
    const allData = await toiletsData;               // 전국 data.json
    const otherCities = allData.filter((d) => d.sido !== SEOUL_SIDO);

    // 서울: 실시간 우선 → 폴백 파일
    let seoul = null;
    if (USE_LIVE_API) {
      try {
        seoul = await fetchFromSeoulApi();
      } catch (e) {
        console.warn('서울 실시간 조회 실패 → 서울 폴백 파일 사용:', e?.message);
      }
    }
    if (!seoul || !seoul.length) {
      try {
        seoul = await loadSeoulFallback();
      } catch (e) {
        console.warn('서울 폴백 파일 로드 실패 → data.json 서울 사용:', e?.message);
        seoul = allData.filter((d) => d.sido === SEOUL_SIDO);
      }
    }

    locations.value = withCarCampingInfo([...seoul, ...otherCities]);
  } catch (error) {
    console.error('데이터 로드 실패:', error);
    locations.value = withCarCampingInfo(await toiletsData);
  } finally {
    isLoading.value = false;
  }
};

// ── 이벤트 핸들러 ─────────────────────────────────────────
// 디바운스 함수
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// 디바운스된 검색 핸들러
const handleSearch = debounce((e) => {
  const query = e.target.value;
  searchQuery.value = query;
  mode.value = 'search';
  selectedToiletId.value = null;
  showSearchAreaBtn.value = false;

  if (query && isValidKoreanSearch(query)) {
    const first = searchResults.value[0];
    centerLocation.value = first
      ? { latitude: first.latitude, longitude: first.longitude }
      : null;
  } else {
    centerLocation.value = null;
  }
}, 300);

// 화장실 목록 클릭 핸들러
const handleLocationClick = (location) => {
  centerLocation.value = { latitude: location.latitude, longitude: location.longitude };
  selectedToiletId.value = location.id;
};

// 반경 변경
const handleRadiusChange = (e) => {
  searchRadius.value = Number(e.target.value);
};

// 현재 위치로 이동하고 근처 화장실 표시
const moveToCurrentLocation = async () => {
  mode.value = 'near';
  searchQuery.value = '';
  selectedToiletId.value = null;
  showSearchAreaBtn.value = false;
  isLocating.value = true;

  try {
    const { latitude, longitude } = await getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
    userPosition.value = { latitude, longitude };
    searchOrigin.value = { latitude, longitude };
    centerLocation.value = { latitude, longitude };
  } catch (error) {
    console.warn('현재 위치를 가져올 수 없어 기본 위치(서울시청)를 사용합니다:', error);
    userPosition.value = { ...DEFAULT_POSITION };
    searchOrigin.value = { ...DEFAULT_POSITION };
    centerLocation.value = { ...DEFAULT_POSITION };
  } finally {
    isLocating.value = false;
  }
};

// 지도 영역 변경 시: '이 근처 검색' 버튼 노출
const handleRegionChanged = (center) => {
  pendingRegion.value = center;
  // 기준점에서 어느 정도 이동했을 때만 버튼 노출
  if (!searchOrigin.value) {
    showSearchAreaBtn.value = true;
    return;
  }
  const moved = getDistanceFromLatLonInKm(
    searchOrigin.value.latitude, searchOrigin.value.longitude,
    center.latitude, center.longitude
  );
  showSearchAreaBtn.value = moved > 0.1; // 100m 이상 이동 시
};

// '이 근처 검색': 현재 지도 중심 기준으로 재검색 (지도는 이동하지 않음)
const searchThisArea = () => {
  if (!pendingRegion.value) return;
  mode.value = 'near';
  searchQuery.value = '';
  selectedToiletId.value = null;
  searchOrigin.value = { ...pendingRegion.value };
  showSearchAreaBtn.value = false;
};

const handleMapTap = () => {
  sheetExpanded.value = false;
  selectedToiletId.value = null;
};

onMounted(() => {
  initializeAdMob();
  loadStatus().then((s) => { toiletStatus.value = migrateStatus(s); }); // 저장된 상태 파일 로드
  fetchToilets().then(() => {
    moveToCurrentLocation(); // 마운트 시 현재 위치 기준으로 주변 화장실 표시
  });
});
</script>

<template>
  <div class="container">
    <div class="map-container">
      <NaverMapMarker
        :locations="displayedLocations"
        :selected-id="selectedToiletId"
        :center="centerLocation"
        :status-map="toiletStatus"
        :status-options="STATUS_OPTIONS"
        @region-changed="handleRegionChanged"
        @map-tap="handleMapTap"
        @set-status="voteStatus"
      />
      <button
        v-if="showSearchAreaBtn"
        class="search-area-btn"
        @click="searchThisArea"
      >
        🔍 이 근처 검색
      </button>
    </div>
    <div class="bottom-container" :class="{ expanded: sheetExpanded }">
      <button
        type="button"
        class="sheet-handle"
        @click="sheetExpanded = !sheetExpanded"
        :aria-label="sheetExpanded ? '목록 접기' : '목록 펼치기'"
      >
        <span class="grabber"></span>
      </button>
      <div class="search-container">
        <input
          type="text"
          v-model="searchQuery"
          @input="handleSearch"
          placeholder="구나 동 이름으로 검색 (예: 강남구, 역삼동)"
          class="search-input"
          :disabled="isLoading"
        />
        <div class="controls">
          <button
            type="button"
            class="near-btn"
            :class="{ active: mode === 'near' }"
            :disabled="isLoading || isLocating"
            @click="moveToCurrentLocation"
          >
            📍 내 주변
          </button>
          <select
            class="radius-select"
            :value="searchRadius"
            :disabled="isLoading"
            @change="handleRadiusChange"
            title="검색 반경"
          >
            <option v-for="r in RADIUS_OPTIONS" :key="r" :value="r">
              {{ r < 1000 ? `${r}m` : `${r / 1000}km` }}
            </option>
          </select>
        </div>
        <div class="search-info"
             :class="{ 'warning': mode === 'search' && searchQuery && !isValidKoreanSearch(searchQuery) }">
          {{ searchStatus }}
        </div>
        <div class="camping-filter" aria-label="차박 편의정보 필터">
          <button
            type="button"
            class="camping-filter-toggle"
            :aria-expanded="showCarCampingFilters"
            @click="showCarCampingFilters = !showCarCampingFilters"
          >
            <span>🚐 차박 편의정보 조회조건</span>
            <span class="camping-filter-summary">
              {{ carCampingFilter === 'all'
                ? '선택'
                : CAR_CAMPING_OPTIONS.find((option) => option.key === carCampingFilter)?.label }}
              {{ showCarCampingFilters ? '▲' : '▼' }}
            </span>
          </button>
          <div v-if="showCarCampingFilters" class="camping-filter-options">
            <button
              v-for="option in CAR_CAMPING_OPTIONS"
              :key="option.key"
              type="button"
              class="camping-filter-btn"
              :class="{ active: carCampingFilter === option.key }"
              @click="carCampingFilter = option.key"
            >
              {{ option.label }}
            </button>
          </div>
          <p v-if="showCarCampingFilters" class="camping-notice">현장 규정은 바뀔 수 있으니 관리기관 안내를 확인하세요.</p>
        </div>
      </div>
      <div class="list-scroll">
        <ul v-if="!isLoading">
          <li
            v-for="location in displayedLocations"
            :key="location.id"
            class="location-item"
            :class="{ 'selected': selectedToiletId === location.id }"
            @click="handleLocationClick(location)"
          >
            <div class="location-head">
              <h3>{{ location.title }}</h3>
              <div class="badges">
                <span v-if="statusInfo(location.id)" class="status-badge"
                      :style="{ backgroundColor: statusInfo(location.id).color }">
                  {{ statusInfo(location.id).label }}<template v-if="statusInfo(location.id).count"> {{ statusInfo(location.id).count }}</template>
                </span>
                <span v-if="location.carCamping" class="camping-badge"
                      :style="{ backgroundColor: location.carCamping.color }">
                  {{ location.carCamping.shortLabel }}
                </span>
                <span v-if="location.distance != null" class="distance-badge">
                  {{ formatDistance(location.distance) }}
                </span>
              </div>
            </div>
            <p>{{ [location.sido, location.address].filter(Boolean).join(' ') }}<span v-if="location.masterno"> {{ location.masterno }}번지</span></p>
            <p v-if="location.newAddress" class="new-address">도로명: {{ location.newAddress }}</p>
          </li>
        </ul>
        <div v-else class="loading-message">
          데이터를 불러오는 중입니다...
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container {
  width: 100%;
  height: calc(100vh - var(--admob-banner-height, 0px));
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.search-input {
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}

.map-container {
  flex: 1;
  position: relative;
  min-height: 300px; /* 모바일에서 최소 높이 보장 */
}

/* '이 근처 검색' 버튼 (지도 상단 중앙 플로팅) */
.search-area-btn {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 10px 20px;
  background-color: #2196F3;
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.2s;
}

.search-area-btn:hover {
  background-color: #1976D2;
}

.search-area-btn:active {
  transform: translateX(-50%) scale(0.97);
}

.bottom-container {
  background-color: #f5f5f5;
  padding: 15px;
  border-top: 1px solid #ddd;
  display: flex;
  gap: 15px;
  height: 230px; /* Reduced height to move it up */
  margin-top: -20px; /* Negative margin to move it up */
}

/* 하단 시트 펼침/접기 핸들 (모바일 전용) */
.sheet-handle {
  display: none;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 22px;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.sheet-handle .grabber {
  width: 40px;
  height: 5px;
  border-radius: 3px;
  background: #ccc;
}

.search-container {
  width: 250px;  /* 너비 줄임 */
  padding: 4px;  /* 패딩 줄임 */
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  gap: 8px;  /* 간격 줄임 */
}

.search-input {
  width: 100%;
  height: 45px;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.search-input:focus {
  border-color: #2196F3;
  outline: none;
}

.controls {
  display: flex;
  gap: 8px;
}

.near-btn {
  flex: 1;
  height: 38px;
  border: 1px solid #2196F3;
  border-radius: 4px;
  background-color: #fff;
  color: #2196F3;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.near-btn:hover:not(:disabled) {
  background-color: #e3f2fd;
}

.near-btn.active {
  background-color: #2196F3;
  color: #fff;
}

.near-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.radius-select {
  width: 90px;
  height: 38px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 13px;
  background-color: #fff;
  cursor: pointer;
}

.radius-select:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.location-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.badges {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.distance-badge {
  flex-shrink: 0;
  background-color: #2196F3;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.status-badge {
  flex-shrink: 0;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.camping-badge {
  flex-shrink: 0;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.camping-filter {
  padding: 8px;
  border: 1px solid #ffe0b2;
  border-radius: 7px;
  background: #fffaf2;
}

.camping-filter-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #5d4037;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}

.camping-filter-summary {
  color: #ef6c00;
  font-size: 11px;
  white-space: nowrap;
}

.camping-filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.camping-filter-btn {
  padding: 5px 7px;
  border: 1px solid #d7ccc8;
  border-radius: 12px;
  background: #fff;
  color: #5d4037;
  font-size: 10px;
  cursor: pointer;
}

.camping-filter-btn.active {
  border-color: #ef6c00;
  background: #ef6c00;
  color: #fff;
  font-weight: 700;
}

.camping-notice {
  margin: 6px 0 0;
  color: #8d6e63;
  font-size: 9px;
  line-height: 1.35;
}

.search-info {
  font-size: 14px;
  color: #666;
  padding: 2px;
  text-align: center;
}

.search-info.warning {
  color: #ff6b6b;
  font-weight: 500;
}

.list-scroll {
  flex: 1;
  overflow-y: auto;
  background-color: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.location-item {
  padding: 10px;
  margin-bottom: 8px;
  background-color: #f8f8f8;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.location-item:hover {
  background-color: #f0f0f0;
  transform: translateY(-2px);
}

.location-item.selected {
  background-color: #e3f2fd;
  border: 1px solid #2196F3;
}

.location-item h3 {
  margin: 0 0 4px 0;  /* 마진 줄임 */
  color: #333;
  font-size: 14px;  /* 폰트 크기 줄임 */
}

.location-item p {
  margin: 0;
  color: #666;
  font-size: 12px;  /* 폰트 크기 줄임 */
}

.new-address {
  margin-top: 4px !important;
  color: #2196F3 !important;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;  /* flex에서 grid로 변경 */
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));  /* 반응형 그리드 */
  gap: 10px;
}

/* 검색 결과가 없을 때 */
ul:empty::after {
  content: '검색 결과가 없습니다';
  display: block;
  text-align: center;
  padding: 20px;
  color: #666;
  font-size: 14px;
}

/* 반응형 스타일 수정 */
@media (max-width: 1440px) {
  .bottom-container {
    height: 300px;
  }
}

@media (max-width: 1024px) {
  .bottom-container {
    height: 320px;
  }

  ul {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
}

@media (max-width: 768px) {
  .container {
    height: calc(100vh - var(--admob-banner-height, 0px));
    overflow: hidden;
  }

  /* 상태바·카메라 홀과 겹치지 않도록 모바일에서는 버튼을 아래로 배치 */
  .search-area-btn {
    top: max(76px, calc(env(safe-area-inset-top, 0px) + 52px));
  }

  /* 지도는 남은 공간을 채움 (고정 70vh 제거 → 하단 시트가 잘리지 않도록) */
  .map-container {
    flex: 1;
    min-height: 180px;
  }

  .sheet-handle {
    display: flex;  /* 모바일에서 핸들 노출 */
  }

  .bottom-container {
    flex-direction: column;
    height: 310px;             /* 검색·차박 필터가 잘리지 않는 높이 */
    margin-top: 0;
    padding: 8px 12px 12px;
    gap: 8px;
    overflow: hidden;
    transition: height 0.25s ease;
  }

  .bottom-container.expanded {
    height: 82vh;             /* 펼친 상태: 화면 대부분 */
  }

  .search-container {
    width: 100%;
    flex-shrink: 0;
  }

  .camping-filter {
    padding: 7px;
  }

  .camping-filter-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }

  .camping-filter-btn {
    min-width: 0;
    padding: 6px 4px;
    white-space: nowrap;
  }

  .list-scroll {
    width: 100%;
    flex: 1;                  /* 남은 높이를 목록이 채우고 스크롤 */
    overflow-y: auto;
  }

  ul {
    grid-template-columns: 1fr;  /* 모바일에서 1열로 */
  }
}

@media (max-width: 480px) {
  .bottom-container {
    padding: 8px 10px 10px;
    gap: 6px;
    /* height 는 768px 미디어쿼리의 46vh / .expanded 82vh 를 그대로 사용 */
  }

  .search-container {
    padding: 4px;
  }

  .list-scroll {
    padding: 8px;
  }

  .location-item {
    padding: 8px;
    margin-bottom: 6px;
  }

  .search-input {
    padding: 6px;
    font-size: 12px;
  }

  .search-info {
    font-size: 12px;
  }

  .location-item h3 {
    font-size: 13px;
  }

  .location-item p {
    font-size: 11px;
  }
}

.loading-message {
  text-align: center;
  padding: 20px;
  color: #666;
  font-size: 14px;
}

.search-input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}
</style>
