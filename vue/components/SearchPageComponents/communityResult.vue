<template>
    <searchResult v-bind:image="result.imageEnabled ? '/images/communities/' + result.image : '/images/communities/cake.svg'">
        <template v-slot:typeLabel>
        <i class="fas fa-leaf"></i> Community
        </template>

        <template v-slot:title>
        <strong>
            <a class="authorLink" v-bind:href="'/community/' + result.slug">{{result.name}}</a> &middot;
        </strong>
        <span class="text-muted">
            {{result.membersCount}} member{{(result.membersCount === 1 ? '' : 's')}}
        </span>
        </template>

        <template v-slot:description>
        <p v-html="result.descriptionParsed"></p>
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