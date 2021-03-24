<template>
  <div v-if="userData">
    <label for="defaultAudience">Default Audience for new posts</label>
    <select name="defaultAudience" id="defaultAudience">
      <option v-for="audience in audiences" :value="audience._id" :key="audience._id" :selected="userData.settings.defaultAudience ? userData.settings.defaultAudience === audience._id : false">{{audience.name}}</option>
      <option value="everyone" :selected="userData.settings.defaultAudience ? userData.settings.defaultAudience === false : true">Everyone</option>
    </select>
  </div>
</template>

<script>
import Vue from "vue";
import axios from "axios";
import swal from "sweetalert2";

export default {
  components: { },
  props: {},
  data() {
    return {
      audiences: null,
      userData: null,
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
          .map(function(c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      return JSON.parse(jsonPayload);
    },
  },
  beforeMount() {
    // Get user data
    const userId = this.parseJWT(localStorage.getItem("JWT")).id;
    axios
      .get(`http://localhost:8787/api/user/${userId}`, {
        headers: { Authorization: localStorage.getItem("JWT") },
      })
      .then((response) => {
        this.userData = response.data.data.profileData;
      })
      .catch((error) => {
        if (error.response && error.response.status === 401) {
          console.log("Destroying invalid session");
          window.location.assign("/logout");
        }
    });
    // Get user audience data
    axios
      .get(`http://localhost:8787/api/audience`, {
        headers: { Authorization: localStorage.getItem("JWT") },
      })
      .then((response) => {
        this.audiences = response.data.data;
      })
      .catch((error) => {
        if (error.response.status === 401) {
          console.log("Destroying invalid session");
          window.location.assign("/logout");
        }
      });
  },
}
</script>