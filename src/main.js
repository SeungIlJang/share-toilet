import './assets/main.css'
import { createNaverMap } from "vue3-naver-maps";

import { createApp } from 'vue'
import App from './App.vue'

createApp(App)
    .use(createNaverMap, {
        clientId: "3an1unpc88", // Required
        category: "ncp", // Optional
        subModules: [], // Optional
    })
    .mount("#app");
