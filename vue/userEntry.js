import Vue from 'vue'
import PostFeed from './components/PostFeed.vue'

new Vue({
  el: '#user-app',
  template: `<post-feed :context="'user'" v-if="canMount"/>`,
  components: { PostFeed },
  data() {
    return {
      canMount: false
    }
  },
  beforeMount() {
    if (localStorage.getItem('JWT')) {
      this.canMount = true;
    }
  }
})
