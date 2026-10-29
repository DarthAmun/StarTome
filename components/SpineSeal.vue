<template>
  <div class="spine-seal">
    <img :src="logoSrc" class="spine-seal-logo" alt="StarTome" />
    <span class="spine-seal-version">v{{ version }}</span>
  </div>
</template>

<script setup lang="ts">
// public/ files need the app base URL (/StarTome/ on GitHub Pages)
const logoSrc = `${useRuntimeConfig().app.baseURL}icons/icon-512.png`
const { public: { version } } = useRuntimeConfig()
</script>

<style scoped>
.spine-seal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 7px 14px;
  width: 46px;
  border-bottom: 1px solid rgba(184,134,11,0.25); /* = var(--gold) at 25% opacity */
  margin-bottom: -1px; /* collapse with first tab's top border */
}

.spine-seal-logo {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  object-fit: cover;
  opacity: 0.85;
}

.spine-seal-version {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(232,220,197,0.7); /* parchment-on-dark, translucent */
}
</style>
