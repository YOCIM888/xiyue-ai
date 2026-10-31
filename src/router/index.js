import { createRouter, createWebHashHistory } from 'vue-router'
import ChatArea from '../components/layout/ChatArea.vue'
import StarryView from '../components/starry/StarryView.vue'
import DreamView from '../components/dream/DreamView.vue'

const routes = [
  { path: '/', redirect: '/chat' },
  { path: '/chat/:id?', component: ChatArea, props: true },
  { path: '/starry', component: StarryView },
  { path: '/dream', component: DreamView },
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
})
