<template>
  <div class="starry-view">
    <header v-if="!isMobile || mobileView === 'list'" class="starry-header">
      <div class="brand-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3z" /></svg>
      </div>
      <div class="brand-text">
        <h1>探索星空</h1>
        <p>与星空中的TA们聊聊</p>
      </div>
      <button class="exit-btn" title="退出探索星空" @click="exitStarry">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
      </button>
    </header>

    <div class="starry-body">
      <!-- 桌面端：左侧会话栏 + 右侧聊天/圈子 -->
      <template v-if="!isMobile">
        <StarryContacts
          :friends="store.friends"
          :groups="store.groups"
          :active-type="store.activeType"
          :active-id="store.activeId"
          show-circle-entry
          :circle-active="desktopMode === 'circle'"
          @select="selectChat"
          @add="openAddMenu"
          @open-circle="openCircle"
        />

        <StarryCircle v-if="desktopMode === 'circle'" />

        <StarryChat
          v-else-if="store.activeChat"
          :type="store.activeType"
          :chat="store.activeChat"
          @back="backToList"
          @open-friend="friendDialogRef?.open($event)"
          @open-group="groupDialogRef?.open($event)"
          @deleted="onDeleted"
        />

        <div v-else class="chat-placeholder">
          <div class="placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3z" /></svg>
          </div>
          <p class="placeholder-title">选择一位好友或群聊</p>
          <p class="placeholder-desc">星空的对话只属于这里，不会被主聊天记住</p>
        </div>
      </template>

      <!-- 手机端：聊天 / 通讯录 / 圈子 -->
      <template v-else>
        <StarryContacts
          v-if="mobileView === 'list' && mobileTab === 'chat'"
          :friends="store.friends"
          :groups="store.groups"
          :active-type="store.activeType"
          :active-id="store.activeId"
          @select="selectChat"
          @add="openAddMenu"
        />

        <StarryDirectory
          v-else-if="mobileView === 'list' && mobileTab === 'directory'"
          :friends="store.friends"
          :groups="store.groups"
          @select="selectChat"
          @add="openAddMenu"
        />

        <StarryCircle
          v-else-if="mobileView === 'list' && mobileTab === 'circle'"
        />

        <StarryChat
          v-if="store.activeChat && mobileView === 'chat'"
          :type="store.activeType"
          :chat="store.activeChat"
          @back="backToList"
          @open-friend="friendDialogRef?.open($event)"
          @open-group="groupDialogRef?.open($event)"
          @deleted="onDeleted"
        />
      </template>
    </div>

    <StarryTabBar
      v-if="isMobile && mobileView === 'list'"
      :active="mobileTab"
      @select="switchTab"
    />

    <FriendDialog ref="friendDialogRef" @saved="onFriendSaved" />
    <GroupDialog ref="groupDialogRef" :friends="store.friends" @created="onGroupCreated" />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import StarryContacts from './StarryContacts.vue'
import StarryChat from './StarryChat.vue'
import StarryDirectory from './StarryDirectory.vue'
import StarryCircle from './StarryCircle.vue'
import StarryTabBar from './StarryTabBar.vue'
import FriendDialog from './FriendDialog.vue'
import GroupDialog from './GroupDialog.vue'
import { useStarryStore } from '../../stores/starry'
import { useSettingsStore } from '../../stores/settings'
import { isApiConfigured } from '../../services/starry'

const store = useStarryStore()
const settings = useSettingsStore()
const router = useRouter()

const friendDialogRef = ref(null)
const groupDialogRef = ref(null)

const isMobile = ref(window.innerWidth <= 768)
const mobileView = ref('list')
const mobileTab = ref('chat')
const desktopMode = ref('chat')

function checkMobile() {
  isMobile.value = window.innerWidth <= 768
}

function selectChat(type, id) {
  store.loadChat(type, id)
  if (isMobile.value) {
    mobileView.value = 'chat'
    mobileTab.value = 'chat'
  } else {
    desktopMode.value = 'chat'
  }
}

function switchTab(key) {
  mobileTab.value = key
  mobileView.value = 'list'
}

function backToList() {
  mobileView.value = 'list'
  mobileTab.value = 'chat'
}

function openCircle() {
  desktopMode.value = 'circle'
}

function openAddMenu(e) {
  let x = 12
  let y = 60
  if (e?.currentTarget) {
    const rect = e.currentTarget.getBoundingClientRect()
    x = rect.left - 110
    y = rect.bottom + 6
  }
  window.__ui?.showMenu(x, y, [
    { label: '添加好友', action: () => friendDialogRef.value?.open() },
    { label: '新建群聊', action: () => groupDialogRef.value?.open() },
    { label: '恢复默认好友', action: restoreDefaults },
  ])
}

function restoreDefaults() {
  const added = store.restoreDefaultFriends()
  if (added) {
    window.__ui?.showToast(`已恢复 ${added} 位默认好友`, 'success')
  } else {
    window.__ui?.showToast('默认好友都已在列表中', 'info')
  }
}

function onGroupCreated(group) {
  store.loadChat('group', group.id)
  if (isMobile.value) {
    mobileView.value = 'chat'
    mobileTab.value = 'chat'
  } else {
    desktopMode.value = 'chat'
  }
}

function onFriendSaved() {
  // 名称或头像更新后无需额外操作，表格与消息区直接读 store
}

function onDeleted() {
  mobileView.value = 'list'
  mobileTab.value = 'chat'
  desktopMode.value = 'chat'
}

function exitStarry() {
  router.push('/chat')
}

onMounted(() => {
  store.init()
  window.addEventListener('resize', checkMobile)
  if (!isApiConfigured(settings)) {
    window.__ui?.showToast('请先在设置中配置模型 API', 'info', 3500)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})
</script>

<style scoped>
.starry-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.starry-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px 12px 56px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  flex-shrink: 0;
  min-height: 64px;
}
.brand-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1, #a78bfa 55%, #38bdf8);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 3px 10px rgba(99, 102, 241, 0.25);
}
.brand-text h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}
.brand-text p {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}
.exit-btn {
  margin-left: auto;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.exit-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.starry-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.chat-placeholder {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  text-align: center;
  padding: 24px;
}
.placeholder-icon {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  background: var(--accent-light);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}
.placeholder-title {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.placeholder-desc {
  font-size: 12px;
}

@media (max-width: 768px) {
  .starry-header {
    padding: 10px 16px 10px 56px;
    min-height: 60px;
  }
  .brand-icon {
    width: 34px;
    height: 34px;
  }
  .starry-body {
    position: relative;
  }
}
</style>
