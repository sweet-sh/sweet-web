import Vue from 'vue'
import PostEditor from './components/PostEditor.vue'
import PostFeed from './components/PostFeed.vue'

new Vue({
  el: '#community-app',
  template: `
    <div>
      <div class="post-editor__container">
        <post-editor :context="'community'" />
      </div>
      <post-feed :context="'community'" />
    </div>`,
  components: { PostEditor, PostFeed },
})
