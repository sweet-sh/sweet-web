<template>
    <searchResult v-bind:image="imageEnabled ? 'https://sweet-images.s3.amazonaws.com/' + image : '/images/cake.svg'">

        <template v-slot:typeLabel>
            <i class="fas fa-user"></i> User
        </template>

        <template v-if="displayName" v-slot:title>
            <strong><a class="authorLink" v-bind:href="'/' + username">{{displayName}}</a></strong> &middot; <span class="text-muted">@{{username}}</span>
            <i v-if="flagged" class="fas fa-exclamation-triangle text-danger"></i>
        </template>
        <template v-else v-slot:title>
            <strong><a class="authorLink" v-bind:href="'/' + username">@{{username}}</a></strong>
            <i v-if="flagged" class="fas fa-exclamation-triangle text-danger"></i>
        </template>

        <template v-slot:description>
            <p v-html="aboutParsed"></p>
        </template>

    </searchResult>
</template>

<script>
import searchResult from './searchResultOutline.vue'
export default {
    components: {searchResult},
    props: {
        imageEnabled: {
            type: Boolean,
            required: true
        },
        image: {
            type: String,
            required: false
        },
        username: {
            type: String,
            required: true
        },
        displayName: {
            type: String,
            required: false
        },
        aboutParsed: {
            type: String,
            required: true
        },
        flagged: {
            type: Boolean,
            required: true
        }
    }
}
</script>