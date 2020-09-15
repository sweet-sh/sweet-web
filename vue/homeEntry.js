import Vue from 'vue'
import PostEditor from './components/PostEditor.vue'
import PostFeed from './components/PostFeed.vue'

new Vue({
  el: '#home-app',
  template: `
    <div>
      <div class="post-editor__container">
        <post-editor :context="'home'" />
      </div>
      <post-feed />
    </div>`,
  components: { PostEditor, PostFeed },
})
