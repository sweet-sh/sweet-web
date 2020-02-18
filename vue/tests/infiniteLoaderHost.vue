<template>
    <div>
        <div v-bind:key="result._id" v-for="result in results">
            {{result}}
        </div>
        <loadingSpinner v-if="loading || allResultsLoaded" v-bind:loading="loading" v-bind:message="loading ? '' : (firstPageFetched ? 'No more results.' : 'No results found, sorry.')" />
    </div>
</template>

<script>
import infiniteLoader from '../components/SharedSubComponents/infiniteLoaderMixin'
import loadingSpinner from '../components/SharedSubComponents/loadingSpinner'
export default {
    mixins: [infiniteLoader],
    components: {loadingSpinner}
}
</script>