import './assets/main.css'
import { createNaverMap } from "vue3-naver-maps";

import { createApp } from 'vue'
import App from './App.vue'
import { startLiveUpdate } from './services/liveUpdate.js'

createApp(App)
    .use(createNaverMap, {
        clientId: import.meta.env.VITE_NAVER_CLIENT_ID, // .env 의 VITE_NAVER_CLIENT_ID
        category: "ncp", // Optional
        subModules: [], // Optional
    })
    .mount("#app");

// 네이티브 앱에서는 현재 번들의 정상 실행을 알린 뒤 새 웹 번들을 백그라운드로 받는다.
// 다운로드된 번들은 사용자가 앱을 닫거나 다음에 실행할 때 적용된다.
void startLiveUpdate();
