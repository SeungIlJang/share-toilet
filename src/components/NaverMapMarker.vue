<script setup>
import { ref, onMounted, watch } from 'vue';

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
  if (newId) {
    showInfoWindow(newId);
  }
});

// center prop 변경 감지 수정
watch(() => props.center, (newCenter) => {
  if (newCenter && map.value) {
    const position = new naver.maps.LatLng(newCenter.latitude, newCenter.longitude);
    smoothMoveMap(position, 15); // 검색 결과로 이동할 때만 줌 레벨 지정
  }
}, { deep: true, immediate: true });

const initMap = () => {
  // 기존 마커와 정보창 제거
  Object.values(markers.value).forEach(marker => marker.setMap(null));
  Object.values(infoWindows.value).forEach(info => info.close());
  markers.value = {};
  infoWindows.value = {};

  // 지도가 없으면 생성
  if (!map.value) {
    // 현재 위치 가져오기
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      map.value = new naver.maps.Map('map', {
        center: new naver.maps.LatLng(latitude, longitude),
        zoom: 15,
      });
    }, () => {
      // 위치 가져오기 실패 시 기본 위치 설정
      map.value = new naver.maps.Map('map', {
        center: new naver.maps.LatLng(37.5666805, 126.9784147),
        zoom: 15,
      });
    });
  }

  // 마커 생성
  props.locations.forEach((location) => {
    const position = new naver.maps.LatLng(location.latitude, location.longitude);
    
    const marker = new naver.maps.Marker({
      position: position,
      map: map.value,
      title: location.title
    });

    const infoWindow = new naver.maps.InfoWindow({
      content: `
        <div class="info-window">
          <h3>${location.title}</h3>
          <p>주소: ${location.address}</p>
          ${location.newAddress ? `<p>도로명: ${location.newAddress}</p>` : ''}
          <p>구: ${location.guName}</p>
          <p>동: ${location.dongName}</p>
        </div>
      `,
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
};

// locations가 변경될 때마다 지도 업데이트
watch(() => props.locations, (newLocations) => {
  if (newLocations.length > 0) {
    initMap();
  }
}, { deep: true });

onMounted(() => {
  if (window.naver && window.naver.maps) {
    initMap();
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