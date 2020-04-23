<template>
    <searchResult v-bind:image="imageEnabled ? 'https://sweet-images.s3.amazonaws.com/' + image : '/images/communities/cake.svg'">
        <template v-slot:typeLabel>
            <i class="fas fa-leaf"></i> Community
        </template>

        <template v-slot:title>
            <strong>
                <a class="authorLink" v-bind:href="'/community/' + slug">{{name}}</a> &middot;
            </strong>
            <span class="text-muted">
                {{membersCount}} member{{(membersCount === 1 ? '' : 's')}}
            </span>
        </template>

        <template v-slot:description>
            <p v-html="descriptionParsed"></p>
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
        name: {
            type: String,
            required: true
        },
        membersCount: {
            type: Number,
            required: true
        },
        descriptionParsed: {
            type: String,
            required: true
        },
        slug: {
            type: String,
            required: true
        }
    }
}
</script>