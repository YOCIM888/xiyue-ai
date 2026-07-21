import { createRouter, createWebHashHistory } from 'vue-router'
import ChatArea from '../components/layout/ChatArea.vue'

const routes = [
  { path: '/', redirect: '/chat' },
  { path: '/chat/:id?', component: ChatArea, props: true },
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
})
