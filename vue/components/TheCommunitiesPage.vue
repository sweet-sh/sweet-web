<template>
    <communitiesList :list="joinedCommunities" />
</template>

<script>
import communitiesList from './CommunitiesPageComponents/communitiesList.vue'
export default {
    data() {
        return {
            joinedCommunities: JSON.parse(document.getElementById('joinedCommunities').innerHTML)
        }
    },
    components: {communitiesList}
}
</script>