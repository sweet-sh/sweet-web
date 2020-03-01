<template>
  <searchResult :image="imageEnabled ? '/images/' + image : '/images/cake.svg'">
    <template v-slot:typeLabel>
      <i class="fas fa-user" /> User
    </template>

    <template v-if="displayName" v-slot:title>
      <strong>
        <a class="authorLink" :href="'/' + username">{{ displayName }}</a>
      </strong> &middot; <span class="text-muted">@{{ username }}</span>
      <i v-if="flagged" class="fas fa-exclamation-triangle text-danger" />
    </template>
    <template v-else v-slot:title>
      <strong><a class="authorLink" :href="'/' + username">@{{ username }}</a></strong>
      <i v-if="flagged" class="fas fa-exclamation-triangle text-danger" />
    </template>

    <template v-slot:description>
      <p v-html="aboutParsed" />
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
    username: {
      type: String,
      required: true
    },
    displayName: {
      type: String,
      required: false,
      default: ''
    },
    aboutParsed: {
      type: String,
      required: false,
      default: ''
    },
    flagged: {
      type: Boolean,
      required: true
    }
  }
}
</script>
