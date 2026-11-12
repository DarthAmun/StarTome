<script setup lang="ts">
const route = useRoute()
const router = useRouter()
onMounted(() => {
  router.replace(`/campaign/${route.params.id}/locations`)
})
</script>
