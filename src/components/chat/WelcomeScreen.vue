<template>
  <div class="welcome-screen">
    <div class="welcome-content">
      <div class="logo">
        <img src="/xiyue.png" alt="XIYUE AI" class="logo-img" />
      </div>
      <h2>XIYUE AI</h2>
      <p class="subtitle">请告诉我您的诉求，随时待命</p>
    </div>
  </div>
</template>

<style scoped>
.welcome-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.welcome-content {
  text-align: center;
  max-width: 520px;
}
.logo {
  margin-bottom: 16px;
}
.logo-img {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--border-color);
}
h2 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px;
}
.subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0;
}

/* 移动端 */
@media (max-width: 768px) {
  .welcome-screen {
    padding: 24px 16px;
  }
}
</style>
