import Vue from 'vue'
import PostEditor from './components/PostEditor.vue'
import PostFeed from './components/PostFeed.vue'
import axios from 'axios';

new Vue({
  el: '#community-app',
  template: `
    <div v-if="canMount">
      <div class="post-editor__container" v-if="canShowEditor">
        <post-editor :context="'community'" :userData="userData"/>
      </div>
      <post-feed :context="'community'" :userData="userData"/>
    </div>`,
  components: { PostEditor, PostFeed },
  data() {
    return {
      userData: null,
      canMount: false,
      canShowEditor: false
    }
  },
  methods: {
    parseJWT(token) {
      if (!token) {
        return false;
      }
      var base64Url = token.split(".")[1];
      var base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      var jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      return JSON.parse(jsonPayload);
    },
  },
  async beforeMount() {
    const parsedUrl = new URL(window.location.href);
    const communitySlug = parsedUrl.pathname
      .split("/")
      .filter(v => v && v !== "community")[0];
    // Get the user's data, so we can work out if they belong to this community
    const userId = this.parseJWT(localStorage.getItem("JWT")).id;
    if (userId) {
      const beforeMountPayload = await axios
        .get(`https://api.sweet.sh/api/user/${userId}`, {
          headers: { Authorization: localStorage.getItem("JWT") }
        })
        .then(response => {
          const inCommunity = response.data.data.communitiesData.some(o => o.slug === communitySlug);
          return { inCommunity, userData: response.data.data.profileData };
        })
        .catch(error => {
          if (error.response && error.response.status === 401) {
            console.log("Destroying invalid session");
            window.location.assign("/logout");
          }
          return false;
        });
      if (beforeMountPayload) {
        this.userData = beforeMountPayload.userData;
        this.canShowEditor = beforeMountPayload.inCommunity;
        this.canMount = true;
      }
    }
  }
})
