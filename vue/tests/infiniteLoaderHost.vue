<template>
    <div>
        <div v-bind:key="result._id" v-for="result in results">
            <div>
                {{result}}
            </div>
        </div>
    </div>
</template>

<script>
import infiniteLoader from '../components/SharedSubComponents/infiniteLoaderMixin'
export default {
    mixins: [infiniteLoader]
}
</script>