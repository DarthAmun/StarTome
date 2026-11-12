<script setup lang="ts">
const route = useRoute()
navigateTo(`/campaign/${route.params.id}/graphs`, { replace: true })
</script>
