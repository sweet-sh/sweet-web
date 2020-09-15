import Vue from 'vue'
import PostFeed from './components/PostFeed.vue'

new Vue({
  el: '#tag-app',
  template: `<post-feed :context="'tag'" />`,
  components: { PostFeed },
})
