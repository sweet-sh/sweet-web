<template>
  <searchResult :image="imageEnabled ? '/images/communities/' + image : '/images/communities/cake.svg'">
    <template v-slot:typeLabel>
      <i class="fas fa-leaf" /> Community
    </template>

    <template v-slot:title>
      <strong>
        <a class="authorLink" :href="'/community/' + slug">{{ name }}</a> &middot;
      </strong>
      <span class="text-muted">
        {{ membersCount }} member{{ (membersCount === 1 ? '' : 's') }}
      </span>
    </template>

    <template v-slot:description>
      <p v-html="descriptionParsed" />
    </template>
  </searchResult>
</template>

<script>
import searchResult from './searchResultOutline.vue'
export default {
  components: { searchResult },
  props: {
    imageEnabled: {
      type: Boolean,
      required: true
    },
    image: {
      type: String,
      required: false,
      default: 'cake.svg'
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
