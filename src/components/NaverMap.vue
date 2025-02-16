<template>
  <div>
    <h2>네이버 지도 예제</h2>
    <NaverMap class="map" @load="onLoad"></NaverMap>
  </div>
</template>

<script>
import { NaverMap, useNaver } from "vue3-naver-maps";
import { ref } from "vue";

export default {
  components: { NaverMap },
  setup() {
    const { naver } = useNaver();
    const map = ref(null);
    const markers = ref([]);

    const onLoad = (loadedMap) => {
      map.value = loadedMap;

      // 지도 클릭 이벤트 추가
      naver.maps.Event.addListener(map.value, "click", (e) => {
        addMarker(e.coord);
      });
    };

    // 마커 추가 함수
    const addMarker = (position) => {
      const marker = new naver.maps.Marker({
        position,
        map: map.value,
      });

      // 마커 클릭 시 수정/삭제
      naver.maps.Event.addListener(marker, "click", () => {
        editMarker(marker);
      });

      markers.value.push(marker);
    };

    // 마커 수정 및 삭제
    const editMarker = (marker) => {
      if (confirm("마커를 수정하려면 '확인', 삭제하려면 '취소'를 누르세요.")) {
        marker.setPosition(map.value.getCenter()); // 지도 중앙으로 이동
      } else {
        marker.setMap(null); // 마커 삭제
        markers.value = markers.value.filter((m) => m !== marker);
      }
    };

    return {
      onLoad,
    };
  },
};
</script>

<style>
.map {
  width: 100%;
  height: 500px;
}
</style>
