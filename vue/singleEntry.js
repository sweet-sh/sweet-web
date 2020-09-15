import Vue from 'vue'
import PostFeed from './components/PostFeed.vue'

new Vue({
  el: '#single-app',
  template: `<post-feed :context="'single'" :openAllComments="true" />`,
  components: { PostFeed },
})
