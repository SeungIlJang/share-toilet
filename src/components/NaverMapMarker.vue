<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';

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
  }
});

const map = ref(null);
const markers = ref({});  // 객체로 변경하여 ID로 접근 가능하게 함
const infoWindows = ref({});
const mapInitialized = ref(false);
const currentLocationMarker = ref(null); // 현재 위치 마커
const userPosition = ref(null); // 사용자의 현재 위치 저장


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
const showCurrentLocation = () => {
  if (!map.value) return;

  navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
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

        // 현재 위치로 지도 이동
        smoothMoveMap(currentPosition, 15);
      },
      (error) => {
        console.error('현재 위치를 가져올 수 없습니다:', error);
        alert('현재 위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.');
      }
  );
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
    console.log('Moving to center:', newCenter);
    const position = new naver.maps.LatLng(newCenter.latitude, newCenter.longitude);
    smoothMoveMap(position, 15); // 검색 결과로 이동할 때만 줌 레벨 지정

    // 현재 위치 마커 업데이트
    if (userPosition.value) {
      updateCurrentLocationMarker();
    }
  }
}, { deep: true, immediate: true });

// 마커 생성 함수 분리
const createMarkers = () => {
  console.log('Creating markers for', props.locations.length, 'locations');

  // 기존 마커와 정보창 제거
  Object.values(markers.value).forEach(marker => marker.setMap(null));
  Object.values(infoWindows.value).forEach(info => info.close());
  markers.value = {};
  infoWindows.value = {};

  if (!map.value || !props.locations.length) {
    console.log('Map not initialized or no locations');
    return;
  }

  // 마커 생성
  props.locations.forEach((location) => {
    if (!location.latitude || !location.longitude) {
      console.log('Invalid location data:', location);
      return;
    }

    const position = new naver.maps.LatLng(location.latitude, location.longitude);

    const marker = new naver.maps.Marker({
      position: position,
      map: map.value,
      title: location.title,
      zIndex: 100
    });

    const infoWindow = new naver.maps.InfoWindow({
      content: `
        <div class="info-window">
          <h3>${location.title}</h3>
          <p>주소: 서울시 ${location.address} ${location.masterno || ''}번지</p>
          ${location.newAddress ? `<p>도로명: ${location.newAddress}</p>` : ''}
        </div>
      `,
      zIndex: 150
    });

    // 마커 클릭 이벤트
    naver.maps.Event.addListener(marker, 'click', () => {
      if (infoWindow.getMap()) {
        infoWindow.close();
      } else {
        showInfoWindow(location.id);
      }
    });

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
  console.log('Locations changed:', newLocations.length);
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

// 현재 위치 버튼 추가 함수 수정
const addCurrentLocationButton = () => {
  // 네이버 맵 커스텀 컨트롤 대신 직접 버튼 추가
  // 이 함수는 더 이상 사용하지 않음
};

const initMap = async () => {
  console.log('Initializing map');

  // 지도가 이미 초기화되었으면 마커만 업데이트
  if (map.value) {
    mapInitialized.value = true;
    await nextTick();
    createMarkers();
    return;
  }

  try {
    // 현재 위치 가져오기
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            userPosition.value = { latitude, longitude }; // 사용자 위치 저장
            resolve({ latitude, longitude });
          },
          (error) => {
            console.warn('Geolocation error:', error);
            // 기본 위치 (서울시청)
            resolve({ latitude: 37.5666805, longitude: 126.9784147 });
          },
          { timeout: 5000 }
      );
    });

    console.log('Creating map at position:', position);
    map.value = new naver.maps.Map('map', {
      center: new naver.maps.LatLng(position.latitude, position.longitude),
      zoom: 15,
    });

    // 지도 이동 완료 이벤트 리스너 추가
    naver.maps.Event.addListener(map.value, 'dragend', () => {
      // 지도 이동 후 현재 위치 마커 업데이트
      if (userPosition.value) {
        updateCurrentLocationMarker();
      }
    });

    // 지도 줌 변경 이벤트 리스너 추가
    naver.maps.Event.addListener(map.value, 'zoom_changed', () => {
      // 줌 변경 후 현재 위치 마커 업데이트
      if (userPosition.value) {
        updateCurrentLocationMarker();
      }
    });

    mapInitialized.value = true;

    // 현재 위치 버튼 추가 호출 제거
    // addCurrentLocationButton();

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

onMounted(async () => {
  console.log('Component mounted');

  // Naver Maps API가 로드되었는지 확인
  if (window.naver && window.naver.maps) {
    await initMap();
  } else {
    console.log('Waiting for Naver Maps API to load');
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