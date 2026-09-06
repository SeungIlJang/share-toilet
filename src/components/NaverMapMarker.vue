<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Capacitor } from '@capacitor/core';
import { getCurrentPosition } from '@/utils/geolocation.js';
import toiletIconUrl from '@/assets/toilet.png';

const props = defineProps({
  locations: {
    type: Array,
    required: true
  },
  selectedId: { // 선택된 마커의 ID
    type: [String, Number],
    default: null
  },
  center: {
    type: Object,
    default: null
  },
  statusMap: { // { [toiletId]: statusKey } 화장실 상태
    type: Object,
    default: () => ({})
  },
  statusOptions: { // [{ key, label, color }]
    type: Array,
    default: () => []
  }
});

// 지도 영역 변경(드래그/줌) 시 현재 지도 중심을 부모로 전달
const emit = defineEmits(['region-changed', 'map-tap', 'set-status']);

// 화장실 id 의 내가 선택한 상태
const statusKeyFor = (id) => (
  props.statusMap && props.statusMap[id] ? props.statusMap[id].my : null
);

// 화장실 id 의 대표 상태색 (= 내가 누른 상태 my)
const statusColorFor = (id) => {
  const key = statusKeyFor(id);
  const opt = key ? props.statusOptions.find((o) => o.key === key) : null;
  return opt ? opt.color : '';
};

const emitRegionChanged = () => {
  if (!map.value) return;
  const c = map.value.getCenter();
  emit('region-changed', { latitude: c.lat(), longitude: c.lng() });
};

// 지도/마커 상호작용 시 소프트 키보드 내리기 (입력창 포커스 해제)
const dismissKeyboard = () => {
  const el = document.activeElement;
  if (el && typeof el.blur === 'function') el.blur();
};

const map = ref(null);
const markers = ref({});  // 객체로 변경하여 ID로 접근 가능하게 함
const infoWindows = ref({});
const mapInitialized = ref(false);
const currentLocationMarker = ref(null); // 현재 위치 마커
const userPosition = ref(null); // 사용자의 현재 위치 저장
let mapDomElement = null;
let mapDomClickHandler = null;


// 부드러운 지도 이동 함수 수정
const smoothMoveMap = (position, zoom = null) => {
  if (!map.value) return;

  map.value.panTo(position, {
    duration: 500,
    easing: 'easeOutCubic'
  });

  // zoom 파라미터가 전달된 경우에만 줌 레벨 변경
  if (zoom !== null && map.value.getZoom() !== zoom) {
    map.value.setZoom(zoom, {
      duration: 500,
      easing: 'easeOutCubic'
    });
  }
};

// 현재 위치 표시 함수
const showCurrentLocation = async () => {
  if (!map.value) return;

  try {
    const { latitude, longitude } = await getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 });
    userPosition.value = { latitude, longitude }; // 사용자 위치 저장
    const currentPosition = new naver.maps.LatLng(latitude, longitude);

    // 기존 현재 위치 마커 제거
    if (currentLocationMarker.value) {
      currentLocationMarker.value.setMap(null);
    }

    // 현재 위치 마커 생성
    currentLocationMarker.value = new naver.maps.Marker({
      position: currentPosition,
      map: map.value,
      icon: {
        content: `
          <div class="current-location-marker">
            <div class="pulse"></div>
            <div class="pin"></div>
          </div>
        `,
        anchor: new naver.maps.Point(15, 15)
      },
      zIndex: 200
    });

    // 현재 확대/축소 단계는 유지하고 지도 중심만 현재 위치로 이동
    smoothMoveMap(currentPosition);
  } catch (error) {
    console.error('현재 위치를 가져올 수 없습니다:', error);
    alert('현재 위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.');
  }
};

// 지도 이동 시 현재 위치 마커 업데이트
const updateCurrentLocationMarker = () => {
  if (!map.value || !userPosition.value) return;

  const { latitude, longitude } = userPosition.value;
  const currentPosition = new naver.maps.LatLng(latitude, longitude);

  // 기존 현재 위치 마커 제거
  if (currentLocationMarker.value) {
    currentLocationMarker.value.setMap(null);
  }

  // 현재 위치 마커 생성
  currentLocationMarker.value = new naver.maps.Marker({
    position: currentPosition,
    map: map.value,
    icon: {
      content: `
        <div class="current-location-marker">
          <div class="pulse"></div>
          <div class="pin"></div>
        </div>
      `,
      anchor: new naver.maps.Point(15, 15)
    },
    zIndex: 200
  });
};

const showInfoWindow = (markerId) => {
  // 모든 정보창 닫기
  Object.values(infoWindows.value).forEach(info => info.close());

  // 선택된 마커의 정보창 열기
  if (markers.value[markerId] && infoWindows.value[markerId]) {
    infoWindows.value[markerId].open(map.value, markers.value[markerId]);
    updateSelectedStyles(markerId);

    // 해당 마커가 보이도록 지도 이동 (현재 줌 레벨 유지)
    smoothMoveMap(markers.value[markerId].getPosition());
  }
};

// selectedId가 변경될 때 정보창 표시
watch(() => props.selectedId, (newId) => {
  if (newId && mapInitialized.value) {
    showInfoWindow(newId);
  }
});

// center prop 변경 감지 수정
watch(() => props.center, (newCenter) => {
  if (newCenter && map.value) {
    const position = new naver.maps.LatLng(newCenter.latitude, newCenter.longitude);
    smoothMoveMap(position, 15); // 검색 결과로 이동할 때만 줌 레벨 지정

    // 현재 위치 마커 업데이트
    if (userPosition.value) {
      updateCurrentLocationMarker();
    }
  }
}, { deep: true, immediate: true });

// 거리 표기 (1km 미만은 m, 이상은 km)
const formatDistance = (km) => {
  if (km == null) return '';
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
};

// 도보 예상시간 (보행 4.5km/h 기준, 최소 1분)
const formatWalkTime = (km) => {
  if (km == null) return '';
  const min = Math.max(1, Math.round((km / 4.5) * 60));
  return `도보 약 ${min}분`;
};

// HTML/속성 이스케이프
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// 표시용 전체 주소 (도로명 우선, 없으면 시도+지번)
const fullAddress = (loc) => {
  if (loc.newAddress) return loc.newAddress;
  const sido = loc.sido || '서울특별시';
  const jibun = loc.masterno ? `${loc.address} ${loc.masterno}번지` : loc.address;
  return `${sido} ${jibun}`.replace(/\s+/g, ' ').trim();
};

// 네이버 지도 도보 길찾기 웹 URL (현재 위치 → 화장실)
const naverRouteWebUrl = (lat, lng, name) =>
  `https://map.naver.com/p/directions/-/${lng},${lat},${encodeURIComponent(name)},,PLACE_POI/-/walk`;

// 정보창 HTML 생성 (풍부한 데이터가 있으면 자동 표시)
const buildInfoContent = (loc) => {
  // 선택 표시용 부가 정보 (데이터 소스에 있을 때만 노출)
  const rich = [];
  if (loc.openHour) rich.push(`🕒 개방시간: ${esc(loc.openHour)}`);
  if (loc.unisex != null) rich.push(`🚻 ${loc.unisex ? '남녀공용' : '남/녀 구분'}`);
  if (loc.menToilet != null || loc.womenToilet != null) {
    rich.push(`🚽 대변기 남 ${loc.menToilet ?? '-'} · 여 ${loc.womenToilet ?? '-'}`);
  }
  if (loc.disabled) rich.push('♿ 장애인 화장실');
  if (loc.diaper) rich.push('🍼 기저귀 교환대');
  if (loc.tel) rich.push(`☎ ${esc(loc.tel)}`);
  if (loc.carCamping) {
    rich.push(`🚐 <b style="color:${esc(loc.carCamping.color)}">${esc(loc.carCamping.label)}</b>`);
    if (loc.carCamping.reason) rich.push(`ℹ️ ${esc(loc.carCamping.reason)}`);
    if (loc.carCamping.checkedAt) rich.push(`확인일: ${esc(loc.carCamping.checkedAt)}`);
  }
  const richHtml = rich.length
    ? `<div class="info-rich">${rich.map((r) => `<p>${r}</p>`).join('')}</div>`
    : '';

  const distHtml = loc.distance != null
    ? `<p class="info-distance">현재 위치에서 ${formatDistance(loc.distance)} · ${formatWalkTime(loc.distance)}</p>`
    : '';

  // 상태 투표 (1인 1표): 카운트 표시, 내 표 하이라이트, 재탭 시 취소
  const rec = props.statusMap ? props.statusMap[loc.id] : null;
  const my = rec ? rec.my : null;
  const counts = (rec && rec.counts) || {};
  const myOpt = my ? props.statusOptions.find((o) => o.key === my) : null;
  const statusHtml = props.statusOptions.length ? `
    <div class="info-status-label">상태 (1인 1표 · 탭하여 투표/취소)</div>
    <div class="info-status">
      ${props.statusOptions.map((o) => {
        const c = counts[o.key] || 0;
        return `<button type="button" class="stt${my === o.key ? ' on' : ''}" style="--c:${o.color}" onclick='window.__stSetStatus(${JSON.stringify(String(loc.id))}, ${JSON.stringify(o.key)})'><span class="l">${esc(o.label)}</span><span class="n">${c}</span></button>`;
      }).join('')}
    </div>
    ${myOpt ? `<div class="info-my-status">내 선택: <b style="color:${myOpt.color}">${esc(myOpt.label)}</b></div>` : ''}` : '';

  const addr = fullAddress(loc);
  return `
    <div class="info-window">
      <h3>${esc(loc.title)}</h3>
      <p>주소: ${esc(addr)}</p>
      ${richHtml}
      ${distHtml}
      ${statusHtml}
      <div class="info-actions">
        <button class="info-btn route" type="button" onclick='window.__stRoute(${loc.latitude}, ${loc.longitude}, ${JSON.stringify(loc.title)})'>🧭 길찾기</button>
        <button class="info-btn copy" type="button" onclick='window.__stCopyAddress(${JSON.stringify(addr)})'>📋 주소복사</button>
      </div>
    </div>
  `;
};

// 현재 정보창이 열린 마커 id
const openInfoId = ref(null);

// 화장실 아이콘 마커 생성 (상태 색 테두리, 선택 시 강조)
const makeToiletIcon = (selected, statusColor, statusKey) => ({
  content: `<div class="toilet-marker${selected ? ' selected' : ''}${statusKey ? ` status-${statusKey}` : ''}" style="border-color:${statusColor || '#2196F3'}"><img src="${toiletIconUrl}" alt="화장실" /></div>`,
  anchor: new naver.maps.Point(20, 20)
});

// 선택 상태에 따라 모든 마커 아이콘/우선순위 갱신
const updateSelectedStyles = (id) => {
  openInfoId.value = id;
  Object.entries(markers.value).forEach(([mid, marker]) => {
    const isSel = String(mid) === String(id);
    marker.setIcon(makeToiletIcon(isSel, statusColorFor(mid), statusKeyFor(mid)));
    marker.setZIndex(isSel ? 300 : 100);
  });
};

// 마커 클릭 시 정보창 토글
const toggleInfoWindow = (id) => {
  dismissKeyboard(); // 마커 탭 시 키보드 내리기
  if (infoWindows.value[id] && infoWindows.value[id].getMap()) {
    infoWindows.value[id].close();
    updateSelectedStyles(null);
  } else {
    showInfoWindow(id);
  }
};

// 지도 빈 곳을 탭하면 열린 상세 정보창과 마커 선택 표시를 모두 해제
const closeInfoWindows = () => {
  Object.values(infoWindows.value).forEach((info) => info.close());
  updateSelectedStyles(null);
};

const handleMapTap = () => {
  closeInfoWindows();
  dismissKeyboard();
  emit('map-tap');
};

// 마커 생성 함수 분리
const createMarkers = () => {
  // 기존 마커와 정보창 제거
  Object.values(markers.value).forEach(marker => marker.setMap(null));
  Object.values(infoWindows.value).forEach(info => info.close());
  markers.value = {};
  infoWindows.value = {};

  if (!map.value || !props.locations.length) {
    return;
  }

  // 마커 생성
  props.locations.forEach((location) => {
    if (!location.latitude || !location.longitude) {
      return;
    }

    const position = new naver.maps.LatLng(location.latitude, location.longitude);

    const marker = new naver.maps.Marker({
      position: position,
      map: map.value,
      title: location.title,
      icon: makeToiletIcon(
        String(location.id) === String(props.selectedId),
        statusColorFor(location.id),
        statusKeyFor(location.id)
      ),
      zIndex: 100
    });

    const infoWindow = new naver.maps.InfoWindow({
      content: buildInfoContent(location),
      zIndex: 150,
      anchorSkew: true,
      maxWidth: 260
    });

    // 마커 클릭 이벤트 (정보창 토글)
    naver.maps.Event.addListener(marker, 'click', () => toggleInfoWindow(location.id));

    markers.value[location.id] = marker;
    infoWindows.value[location.id] = infoWindow;
  });

  // 선택된 ID가 있으면 해당 마커의 정보창 표시
  if (props.selectedId && markers.value[props.selectedId]) {
    showInfoWindow(props.selectedId);
  }

  // 현재 위치 마커 업데이트
  if (userPosition.value) {
    updateCurrentLocationMarker();
  }
};

// locations가 변경될 때마다 지도 업데이트
watch(() => props.locations, async (newLocations) => {
  if (newLocations.length > 0) {
    // 지도가 초기화되었는지 확인
    if (mapInitialized.value) {
      await nextTick();
      createMarkers();
    } else if (map.value) {
      // 지도는 있지만 초기화 플래그가 설정되지 않은 경우
      mapInitialized.value = true;
      await nextTick();
      createMarkers();
    }
    // 지도가 없는 경우 initMap에서 처리됨
  }
});

const initMap = async () => {
  // 지도가 이미 초기화되었으면 마커만 업데이트
  if (map.value) {
    mapInitialized.value = true;
    await nextTick();
    createMarkers();
    return;
  }

  try {
    // 현재 위치 가져오기 (실패 시 서울시청 기본 좌표)
    let position;
    try {
      position = await getCurrentPosition({ timeout: 5000 });
      userPosition.value = { ...position }; // 사용자 위치 저장
    } catch (error) {
      console.warn('Geolocation error:', error);
      position = { latitude: 37.5666805, longitude: 126.9784147 };
    }

    map.value = new naver.maps.Map('map', {
      center: new naver.maps.LatLng(position.latitude, position.longitude),
      zoom: 15,
    });

    // 지도 탭: 열린 정보창을 닫고 키보드/하단 시트를 정리
    naver.maps.Event.addListener(map.value, 'click', handleMapTap);

    // Android WebView에서는 지도 SDK의 click 이벤트가 간헐적으로 누락될 수 있다.
    // 캡처 단계의 실제 DOM 클릭도 받아 빈 지도 탭을 확실히 처리한다.
    mapDomElement = document.getElementById('map');
    mapDomClickHandler = (event) => {
      if (event.target.closest('.toilet-marker, .info-window')) return;
      handleMapTap();
    };
    mapDomElement?.addEventListener('click', mapDomClickHandler, true);

    // 지도 이동 완료 이벤트 리스너 추가
    naver.maps.Event.addListener(map.value, 'dragend', () => {
      // 지도 이동 후 현재 위치 마커 업데이트
      if (userPosition.value) {
        updateCurrentLocationMarker();
      }
      emitRegionChanged(); // '이 근처 검색' 버튼 노출용
    });

    // 지도 줌 변경 이벤트 리스너 추가
    naver.maps.Event.addListener(map.value, 'zoom_changed', () => {
      // 줌 변경 후 현재 위치 마커 업데이트
      if (userPosition.value) {
        updateCurrentLocationMarker();
      }
      emitRegionChanged();
    });

    mapInitialized.value = true;

    await nextTick();
    createMarkers();

    // 초기 현재 위치 마커 생성
    if (userPosition.value) {
      updateCurrentLocationMarker();
    }
  } catch (error) {
    console.error('Map initialization error:', error);
  }
};

// 간단한 토스트 알림
const showToast = (message) => {
  const el = document.createElement('div');
  el.className = 'st-toast';
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 1500);
};

// 정보창 버튼용 전역 헬퍼 (InfoWindow HTML 의 onclick 에서 호출)
const NAVER_MAP_PACKAGE = 'com.nhn.android.nmap';

const registerInfoWindowHelpers = () => {
  // 상태 선택 → 부모(App)로 전달 (파일 저장 + 목록/마커 반영)
  window.__stSetStatus = (id, status) => emit('set-status', { id, status });

  // 🧭 길찾기: 네이버 지도 앱(도보 경로) → 미설치 시 설치 유도 → 거부 시 웹
  window.__stRoute = async (lat, lng, name) => {
    const label = encodeURIComponent(name || '공중화장실');
    const appUrl = `nmap://route/walk?dlat=${lat}&dlng=${lng}&dname=${label}&appname=com.sharetoilet.app`;
    const webUrl = naverRouteWebUrl(lat, lng, name);
    const storeUrl = `market://details?id=${NAVER_MAP_PACKAGE}`;
    const storeWebUrl = `https://play.google.com/store/apps/details?id=${NAVER_MAP_PACKAGE}`;

    if (!Capacitor.isNativePlatform()) {
      window.open(webUrl, '_blank'); // 웹 환경: 웹 길찾기
      return;
    }

    const { AppLauncher } = await import('@capacitor/app-launcher');
    // ⚠️ Android 의 canOpenUrl 은 URL 스킴이 아니라 '패키지명'으로 설치 여부를 판별한다.
    //    (iOS 는 URL 스킴). 그래서 Android 는 com.nhn.android.nmap 을 넘겨야 함.
    const probe = Capacitor.getPlatform() === 'android' ? NAVER_MAP_PACKAGE : 'nmap://route';
    let installed = false;
    try {
      installed = (await AppLauncher.canOpenUrl({ url: probe })).value;
    } catch (e) { /* 조회 실패 시 미설치로 간주 */ }

    if (installed) {
      try {
        await AppLauncher.openUrl({ url: appUrl }); // 앱 실행 + 도보 길찾기 세팅
      } catch (e) {
        await AppLauncher.openUrl({ url: webUrl });  // 만약 실패하면 웹 길찾기
      }
      return;
    }

    // 미설치 → 설치 유도
    if (window.confirm('길찾기는 네이버 지도 앱이 필요합니다.\n설치하시겠어요?')) {
      try {
        await AppLauncher.openUrl({ url: storeUrl });
      } catch (e) {
        await AppLauncher.openUrl({ url: storeWebUrl });
      }
    } else {
      // 거부 → 웹으로 이동
      await AppLauncher.openUrl({ url: webUrl });
    }
  };

  window.__stCopyAddress = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      showToast('주소를 복사했습니다');
    } catch (e) {
      showToast('복사에 실패했습니다');
    }
  };
};

onUnmounted(() => {
  if (mapDomElement && mapDomClickHandler) {
    mapDomElement.removeEventListener('click', mapDomClickHandler, true);
  }
  delete window.__stCopyAddress;
  delete window.__stRoute;
  delete window.__stSetStatus;
});

// 상태 변경 시: 마커 테두리 색 + 열린 정보창 내용 갱신 (전체 재생성 없이)
watch(() => props.statusMap, () => {
  Object.entries(markers.value).forEach(([mid, marker]) => {
    marker.setIcon(makeToiletIcon(
      String(mid) === String(openInfoId.value),
      statusColorFor(mid),
      statusKeyFor(mid)
    ));
  });
  const oid = openInfoId.value;
  if (oid && infoWindows.value[oid]) {
    const loc = props.locations.find((l) => String(l.id) === String(oid));
    if (loc) infoWindows.value[oid].setContent(buildInfoContent(loc));
  }
}, { deep: true });

onMounted(async () => {
  registerInfoWindowHelpers();

  // Naver Maps API가 로드되었는지 확인
  if (window.naver && window.naver.maps) {
    await initMap();
  } else {
    // API 로드 대기
    const checkNaverMaps = setInterval(() => {
      if (window.naver && window.naver.maps) {
        clearInterval(checkNaverMaps);
        initMap();
      }
    }, 500);

    // 10초 후에도 로드되지 않으면 타임아웃
    setTimeout(() => {
      clearInterval(checkNaverMaps);
      console.error('Naver Maps API load timeout');
    }, 10000);
  }
});
</script>

<template>
  <div id="map" class="map-view"></div>
  <!-- 직접 버튼 추가 -->
  <button class="current-location-btn" @click="showCurrentLocation" title="현재 위치로 이동">
    <span class="current-location-icon"></span>
  </button>
</template>

<style scoped>
.map-view {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

:deep(.info-window) {
  padding: 15px;
  min-width: 200px;
}

:deep(.info-window h3) {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #333;
}

:deep(.info-window p) {
  margin: 0;
  font-size: 14px;
  color: #666;
}

:deep(.info-window .info-distance) {
  margin-top: 6px;
  color: #2196F3;
  font-weight: 600;
}

:deep(.info-window .info-rich) {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eee;
}

:deep(.info-window .info-rich p) {
  margin: 2px 0;
  font-size: 13px;
  color: #444;
}

:deep(.info-window .info-status-label) {
  margin-top: 12px;
  font-size: 12px;
  color: #888;
}

:deep(.info-window .info-status) {
  display: flex;
  gap: 4px;
  margin-top: 5px;
}

:deep(.info-window .info-status .stt) {
  flex: 1 1 0;
  min-width: 0;
  height: 42px;
  padding: 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border: 1px solid var(--c);
  color: var(--c);
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}

:deep(.info-window .info-status .stt .l) {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

:deep(.info-window .info-status .stt .n) {
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}

:deep(.info-window .info-status .stt.on) {
  background: var(--c);
  color: #fff;
}

:deep(.info-window .info-my-status) {
  margin-top: 6px;
  font-size: 12px;
  color: #555;
}

:deep(.info-window .info-actions) {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

:deep(.info-window .info-btn) {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  text-decoration: none;
  box-sizing: border-box;
  white-space: nowrap;
}

:deep(.info-window .info-btn.route) {
  background: #2196F3;
  color: #fff;
  border: 1px solid #2196F3;
}

:deep(.info-window .info-btn.copy) {
  background: #fff;
  color: #2196F3;
  border: 1px solid #2196F3;
}

/* 화장실 마커 (원형 배지 + 화장실 아이콘) */
:deep(.toilet-marker) {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #2196F3;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-sizing: border-box;
  transition: transform 0.15s ease, background-color 0.15s ease;
}

:deep(.toilet-marker img) {
  width: 26px;
  height: 26px;
  object-fit: contain;
  pointer-events: none; /* 클릭 이벤트가 마커로 전달되도록 */
}

/* 사용가능으로 선택한 화장실은 지도에서 즉시 구분되도록 초록 테두리 고정 */
:deep(.toilet-marker.status-available) {
  border-color: #2e7d32 !important;
}

:deep(.toilet-marker.selected) {
  /* 테두리 색(상태색/기본색)은 유지하고 주황 링 + 확대로 강조 */
  border-width: 3px;
  transform: scale(1.3);
  box-shadow: 0 0 0 3px rgba(255, 87, 34, 0.45), 0 3px 8px rgba(0, 0, 0, 0.4);
}

/* 현재 위치 마커 스타일 */
:deep(.current-location-marker) {
  position: relative;
  width: 30px;
  height: 30px;
}

:deep(.current-location-marker .pin) {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4285F4;
  position: absolute;
  top: 8px;
  left: 8px;
  box-shadow: 0 0 0 2px white;
}

:deep(.current-location-marker .pulse) {
  position: absolute;
  width: 30px;
  height: 30px;
  background: rgba(66, 133, 244, 0.3);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* 현재 위치 버튼 스타일 수정 */
.current-location-btn {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background-color: white;
  border: 1px solid #ddd;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  transition: background-color 0.2s;
}

.current-location-btn:hover {
  background-color: #f5f5f5;
}

.current-location-icon {
  width: 24px;
  height: 24px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234285F4'%3E%3Cpath d='M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z'/%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
}
</style>

<!-- 토스트는 document.body 에 붙으므로 전역 스타일 -->
<style>
.st-toast {
  position: fixed;
  bottom: 90px;
  left: 50%;
  transform: translateX(-50%) translateY(10px);
  background: rgba(0, 0, 0, 0.82);
  color: #fff;
  padding: 10px 18px;
  border-radius: 20px;
  font-size: 14px;
  z-index: 3000;
  opacity: 0;
  transition: opacity 0.3s, transform 0.3s;
  pointer-events: none;
}

.st-toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
</style>
