import { createRouter, createWebHashHistory } from 'vue-router'
import ChatArea from '../components/layout/ChatArea.vue'
import StarryView from '../components/starry/StarryView.vue'

const routes = [
  { path: '/', redirect: '/chat' },
  { path: '/chat/:id?', component: ChatArea, props: true },
  { path: '/starry', component: StarryView },
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
})
