import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import { bootStorage, maybeWarnQuota, runStorageMaintenance } from './utils/kv'
import { maybeAutoBackup } from './utils/dataBackup'

async function start() {
  // 先把 IndexedDB 数据（含旧 localStorage 迁移）装入内存缓存，再挂载应用
  await bootStorage()

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')

  // 启动后台维护：安全清理旧数据、配额预警、每日自动备份
  Promise.resolve()
    .then(() => runStorageMaintenance())
    .then(() => maybeWarnQuota())
    .then(() => maybeAutoBackup())
    .catch(err => console.warn('[storage] 启动维护失败', err))
}

start()
