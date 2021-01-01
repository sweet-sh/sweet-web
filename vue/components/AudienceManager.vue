<template>
  <div>
    <div class="pane" style="margin-bottom: 1rem;">
      <button
        type="button"
        class="button"
        @click="newAudienceWindowVisible = !newAudienceWindowVisible"
      >
        <i class="fas fa-plus"></i> Create new Audience
      </button>
      <transition name="slide">
        <div class="border-box" v-show="newAudienceWindowVisible">
          <div class="form-group">
            <input
              type="text"
              placeholder="Audience name"
              v-model="newAudienceName"
            />
          </div>
          <div class="form-group">
            <input
              type="checkbox"
              id="checkbox"
              v-model="newAudienceCanSeeFlags"
            />
            <label for="checkbox"
              >Members of this Audience can see the identities of people I've
              <span
                class="help-text"
                content="You can flag people you don't trust, to warn chosen people about them."
                v-tippy
                >flagged</span
              ></label
            >
          </div>
          <button
            type="button"
            class="button"
            @click="_handleCreateNewAudienceButtonClick"
          >
            Create
          </button>
        </div>
      </transition>
    </div>
    <div class="current-audiences">
      <audience-window
        v-for="audience in audiences"
        :key="audience._id"
        :audience="audience"
        :deleteAudience="deleteAudience"
      />
      <audience-window :audience="everyoneAudience" />
    </div>
  </div>
</template>

<script>
import Vue from "vue";
import VueTippy, { TippyComponent } from "vue-tippy";
Vue.use(VueTippy, {
  arrow: true,
});
import axios from "axios";
import swal from "sweetalert2";
import AudienceWindow from "./SharedSubComponents/AudienceWindow.vue";

export default {
  components: { AudienceWindow },
  props: {},
  data() {
    return {
      audiences: null,
      newAudienceWindowVisible: false,
      newAudienceName: "",
      newAudienceCanSeeFlags: false,
      everyoneAudience: {
        _id: "everyone",
        name: "Everyone",
        capabilities: {},
      },
    };
  },
  computed: {},
  methods: {
    _handleCreateNewAudienceButtonClick() {
      if (this.newAudienceName === "" || this.newAudienceName.length <= 0) {
        console.log("Oh no");
        console.log(this.newAudienceName);
        return false;
      }
      if (this.newAudienceName.length > 60) {
        swal.fire(
          "Hold up.",
          "Audience names can be up to 60 characters long. Keep it short and sweet. <em>Sweet</em>, get it?"
        );
        return false;
      }
      if (this.newAudienceName.toLowerCase() === 'everyone') {
        swal.fire(
          "Hold up.",
          "You've already got an Audience called 'Everyone'. I beg of you, don't make this confusing for yourself."
        );
        return false;
      }
      axios
        .post(
          "http://localhost:8787/api/audience",
          {
            name: this.newAudienceName,
            capabilities: {
              canSeeFlags: this.newAudienceCanSeeFlags,
            },
          },
          {
            headers: {
              Authorization: localStorage.getItem("JWT"),
            },
          }
        )
        .then((response) => {
          this.newAudienceName = "";
          this.newAudienceCanSeeFlags = false;
          this.newAudienceWindowVisible = false;
          console.log("Audience created!");
          this.audiences.push(response.data.data);
        })
        .catch((error) => {
          console.error(error.response);
          swal.fire(
            "Uh-oh.",
            "There has been an unexpected error creating this Audience. Please try again."
          );
          if (error.response.status === 401) {
            console.log("Destroying invalid session");
            window.location.assign("/logout");
          }
        });
    },
    deleteAudience(audienceId) {
      console.log(audienceId);
      console.log();
      this.audiences = this.audiences.filter((o) => o._id !== audienceId);
    },
  },
  beforeMount() {
    axios
      .get(`http://localhost:8787/api/audience`, {
        headers: { Authorization: localStorage.getItem("JWT") },
      })
      .then((response) => {
        console.log(response.data.data);
        this.audiences = response.data.data;
      })
      .catch((error) => {
        if (error.response.status === 401) {
          console.log("Destroying invalid session");
          window.location.assign("/logout");
        }
      });
  },
};
</script>

<style scoped>
.slide-enter-active {
  -moz-transition-duration: 0.15s;
  -webkit-transition-duration: 0.15s;
  -o-transition-duration: 0.15s;
  transition-duration: 0.15s;
  -moz-transition-timing-function: ease-in;
  -webkit-transition-timing-function: ease-in;
  -o-transition-timing-function: ease-in;
  transition-timing-function: ease-in;
}

.slide-leave-active {
  -moz-transition-duration: 0.15s;
  -webkit-transition-duration: 0.15s;
  -o-transition-duration: 0.15s;
  transition-duration: 0.15s;
  -moz-transition-timing-function: cubic-bezier(0, 1, 0.5, 1);
  -webkit-transition-timing-function: cubic-bezier(0, 1, 0.5, 1);
  -o-transition-timing-function: cubic-bezier(0, 1, 0.5, 1);
  transition-timing-function: cubic-bezier(0, 1, 0.5, 1);
}

.slide-enter-to,
.slide-leave {
  max-height: 100px;
  overflow: hidden;
}

.slide-enter,
.slide-leave-to {
  overflow: hidden;
  max-height: 0;
}
</style>