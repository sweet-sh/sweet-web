<template>
    <searchResult image="/images/biscuit.svg">

        <template v-slot:typeLabel>
            <i class="fas fa-hashtag"></i> Tag
        </template>

        <template v-slot:title>
            <strong><a class="authorLink" v-bind:href="'/tag/'+result.name">#{{ result.name }}</a></strong>
        </template>

        <template v-slot:description>
            <p>{{result.posts}} post{{(result.posts === 1 ? '' : 's')}}</p>
        </template>

    </searchResult>
</template>

<script>
import searchResult from './searchResultOutline.vue'
export default {
    props: ['result']
}
</script>