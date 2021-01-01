import Vue from 'vue'
import PostEditor from './components/PostEditor.vue'
import PostFeed from './components/PostFeed.vue'
import axios from 'axios';


new Vue({
  el: '#home-app',
  template: `
    <div v-if="canMount">
      <div class="post-editor__container">
        <post-editor :context="'home'" :userData="userData" />
      </div>
      <post-feed :userData="userData" />
    </div>`,
  components: { PostEditor, PostFeed },
  data() {
    return {
      userData: null,
      canMount: false,
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
    // Get the user's data
    const userId = this.parseJWT(localStorage.getItem("JWT")).id;
    if (userId) {
      const beforeMountPayload = await axios
        .get(`https://api.sweet.sh/api/user/${userId}`, {
          headers: { Authorization: localStorage.getItem("JWT") }
        })
        .then(response => {
          return { userData: response.data.data.profileData };
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
        this.canMount = true;
      }
    }
  }
})
