import Vue from 'vue'
import PostFeed from './components/PostFeed.vue'

new Vue({
  el: '#library-app',
  template: `<post-feed :context="'library'" v-if="canMount"/>`,
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
