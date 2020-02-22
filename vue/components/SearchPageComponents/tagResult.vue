<template>
  <searchResult image="/images/biscuit.svg">
    <template v-slot:typeLabel>
      <i class="fas fa-hashtag" /> Tag
    </template>

    <template v-slot:title>
      <strong><a class="authorLink" :href="'/tag/'+name">#{{ name }}</a></strong>
    </template>

    <template v-slot:description>
      <p>{{ posts }} post{{ (posts === 1 ? '' : 's') }}</p>
    </template>
  </searchResult>
</template>

<script>
import searchResult from './searchResultOutline.vue'
export default {
  components: { searchResult },
  props: {
    name: {
      type: String,
      required: true
    },
    posts: {
      type: Number,
      required: true
    }
  }
}
</script>
