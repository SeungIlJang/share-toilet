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
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }),
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
    
    mapInitialized.value = true;
    await nextTick();
    createMarkers();
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
</style>