<template>
    <searchResult v-bind:image="result.imageEnabled ? '/images/' + result.image : '/images/cake.svg'">

        <template v-slot:typeLabel>
            <i class="fas fa-user"></i> User
        </template>

        <template v-if="result.displayName" v-slot:title>
            <strong><a class="authorLink" v-bind:href="'/' + result.username">{{result.displayName}}</a></strong> &middot; <span class="text-muted">@{{result.username}}</span>
            <i v-if="result.flagged" class="fas fa-exclamation-triangle text-danger"></i>
        </template>
        <template v-else v-slot:title>
            <strong><a class="authorLink" v-bind:href="'/' + result.username">@{{result.username}}</a></strong>
            <i v-if="result.flagged" class="fas fa-exclamation-triangle text-danger"></i>
        </template>

        <template v-slot:description>
            <p v-html="result.aboutParsed"></p>
        </template>

    </searchResult>
</template>

<script>
import searchResult from './searchResultOutline.vue'
export default {
    components: {searchResult},
    props: ['result']
}
</script>