<!--<naver-marker>-->
<!--<div class="marker">-->
<!--  <img :src="clinic.imageUrl">-->
<!--</div>-->
<!--</naver-marker>-->

/*
기존 naver-marker 컴포넌트에 슬롯을 삽입하는 방식(위) 에서,
setIcon 함수를 직접 호출하는 방식으로 변경하기 위해 새로운 컴포넌트(아래)를 만들었습니다.
*/

// @/components/CustomMarker.vue
<script setup>
import { ref, watch } from 'vue'
import { NaverMarker } from 'vue3-naver-maps'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  lat: {
    type: Number,
    required: true,
  },
  lng: {
    type: Number,
    required: true,
  },
})

const marker = ref(null)

watch(() => [marker.value], () => {
  if (!marker.value) return

  marker.value.setIcon({
    content: (
        `<div class="marker">
        <img src="${props.imageUrl}" />
      </div>`
    ),
  })
})
</script>

<template>
  <naver-marker
      :latitude="lat"
      :longitude="lng"
      @on-load="marker = $event"
  />
</template>

<style scoped></style>