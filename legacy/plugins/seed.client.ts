import { seedIfEmpty } from '~/composables/useSeedData'

export default defineNuxtPlugin(async () => {
  await seedIfEmpty()
})
