import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import '@fortawesome/fontawesome-free/css/solid.min.css'
import { bootStorage, maybeWarnQuota, runStorageMaintenance } from './utils/kv'
import { migrateSettingsAtBoot } from './utils/settingsSecret'
import { maybeAutoBackup } from './utils/dataBackup'

async function start() {
  // 先把 IndexedDB 数据（含旧 localStorage 迁移）装入内存缓存，再挂载应用
  await bootStorage()
  // 设置里的 API Key 以密文落盘；挂载前解密，保证设置 store 同步读取到明文
  try {
    await migrateSettingsAtBoot()
  } catch (err) {
    console.warn('[settings] 启动解密失败', err)
  }

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
