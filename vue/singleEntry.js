import Vue from 'vue'
import PostFeed from './components/PostFeed.vue'

new Vue({
  el: '#single-app',
  template: `<post-feed :context="'single'" :openAllComments="true" v-if="canMount"/>
            <div v-else>To see this post, you'll have to log in to Sweet.</div>`,
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
