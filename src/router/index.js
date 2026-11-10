import { createRouter, createWebHashHistory } from 'vue-router'
import ChatArea from '../components/layout/ChatArea.vue'

// /chat 是落地页，静态引入省一次往返；星空与梦境整棵子树都不该进首屏
const routes = [
  { path: '/', redirect: '/chat' },
  { path: '/chat/:id?', component: ChatArea, props: true },
  { path: '/starry', component: () => import('../components/starry/StarryView.vue') },
  { path: '/dream', component: () => import('../components/dream/DreamView.vue') },
]

export default createRouter({
  history: createWebHashHistory(),
  routes,
})
