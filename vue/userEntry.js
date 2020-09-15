import Vue from 'vue'
import PostFeed from './components/PostFeed.vue'

new Vue({
  el: '#user-app',
  template: `<post-feed :context="'user'" />`,
  components: { PostFeed },
})
