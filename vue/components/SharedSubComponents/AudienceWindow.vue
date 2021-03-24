<template>
  <div class="audience-window pane">
    <div class="audience__name-editor" v-if="editingName">
      <input type="text" class="audience-name" v-model="newAudienceName" />
      <button
        @click="_handleAudienceNameSaveButtonClick"
        type="button"
        class="button text-button"
        style="margin: 0 0 0 10px"
        v-tippy
        content="Save title"
      >
        <i class="far fa-check"></i>
      </button>
      <button
        @click="editingName = false"
        type="button"
        class="button text-button"
        style="margin: 0 0 0 5px"
        v-tippy
        content="Cancel"
      >
        <i class="far fa-times"></i>
      </button>
    </div>
    <div class="audience__name" v-else>
      <h4>{{ audience.name }}</h4>
      <button
        @click="_handleAudienceNameEditButtonClick"
        type="button"
        class="button text-button"
        style="margin: 0 0 0 10px"
        v-tippy
        content="Edit Audience title"
        v-if="audience._id !== 'everyone'"
      >
        <i class="fas fa-pencil"></i>
      </button>
      <button
        @click="_handleAudienceDeleteButtonClick"
        type="button"
        class="button text-button"
        style="margin: 0 0 0 10px"
        v-tippy
        content="Delete this Audience"
        v-if="audience._id !== 'everyone'"
      >
        <i class="fas fa-trash"></i>
      </button>
    </div>
    <div
      v-if="
        Object.keys(audience.capabilities).some((o) => audience.capabilities[o])
      "
    >
      <div class="border-box">
        <p>
          <strong>These users:</strong>
          <!-- <button
            v-if="editingCapabilities"
            type="button"
            class="button text-button"
            @click="_handleAudienceCapabilitiesSaveButtonClick"
            v-tippy
            content="Save capabilities"
          ><i class="far fa-check"></i></button> -->
          <!-- <button
            v-else
            type="button"
            class="button text-button"
            @click="_handleAudienceCapabilitiesEditButtonClick"
            v-tippy
            content="Edit Audience capabilities"
          >
            <i class="fas fa-pencil"></i>
          </button> -->
        </p>
        <!-- <div v-if="editingCapabilities">
          <div
            v-for="capability in Object.keys(audience.capabilities)"
            :key="capability"
          >
            <input
              type="checkbox"
              :id="`checkbox--${capability}`"
              v-model="newCapabilities[capability]"
              :checked="audience.capabilities[capability]"
            />
            <label :for="`checkbox--${capability}`">{{
              getCapabilityName(capability, true)
            }}</label>
          </div>
        </div> -->
        <ul class="capabilities-list">
          <li
            v-for="capability in Object.keys(audience.capabilities)"
            :key="capability"
          >
            <i class="fal fa-check"></i> {{ getCapabilityName(capability) }}
          </li>
        </ul>
      </div>
    </div>
    <div
      class="audience__add-new-user-container"
      v-if="audience._id !== 'everyone'"
    >
      <v-select
        v-model="selectedUser"
        @search="fetchUsers"
        :options="suggestedUsers"
        placeholder="Search for someone"
        label="username"
        :filterable="false"
      >
        <template v-slot:option="option">
          <div class="select__option">
            <img
              class="select__avatar"
              :src="
                option.imageEnabled
                  ? `https://sweet-images.s3.eu-west-2.amazonaws.com/${option.image}`
                  : `/images/cake.svg`
              "
            />
            <span v-if="option.displayName" class="select__display-name">{{
              option.displayName
            }}</span>
            <span class="select__username">
              <span v-if="!option.displayName">@{{ option.username }}</span>
              <span v-else>@{{ option.username }}</span>
            </span>
          </div>
        </template>
      </v-select>
      <button class="button" @click="_handleAddUserToAudienceClick">
        <i class="fas fa-user-plus"></i> Add person
      </button>
    </div>
    <div class="audience-users" v-if="audience._id !== 'everyone'">
      <user-card
        v-for="user in audience.users"
        :key="user._id"
        :user="user"
        :deleteCallback="_handleDeleteUserFromAudienceClick"
      />
    </div>
    <div class="message" v-if="audience._id === 'everyone'">
      This special Audience contains everyone on Sweet. When you make a post
      visible to <strong>Everyone</strong>, it will show up for anybody who follows you or
      visits your profile. If you want to always have control over who sees your
      posts, don't make any of them visible to <strong>Everyone</strong>.
    </div>
  </div>
</template>

<script>
import UserCard from "./UserCard.vue";
import vSelect from "vue-select";
import "vue-select/dist/vue-select.css";
import utilMixins from "../../mixins/utilMixins";
import axios from "axios";
import swal from "sweetalert2";

export default {
  components: {
    UserCard,
    vSelect,
  },
  mixins: [utilMixins],
  data() {
    return {
      selectedUser: null,
      suggestedUsers: [],
      editingName: false,
      newAudienceName: null,
      editingCapabilities: false,
      newCapabilities: {},
    };
  },
  props: {
    audience: Object,
    deleteAudience: Function,
  },
  methods: {
    getCapabilityName(capability) {
      const capabilitiesDictionary = {
        canSeeFlags: "Can see the identities of users you've flagged",
        canSeeFollowers: "Can see the people who are following you",
      };
      return capabilitiesDictionary[capability];
    },
    fetchUsers(needle) {
      axios
        .get(`http://localhost:8787/api/users/search/${encodeURI(needle)}`, {
          headers: { Authorization: localStorage.getItem("JWT") },
        })
        .then((response) => {
          const payload = (this.suggestedUsers = response.data.data);
        });
    },
    _handleAddUserToAudienceClick() {
      if (this.selectedUser && this.selectedUser._id) {
        const payload = {
          _id: this.audience._id,
          name: this.audience.name,
          capabilities: this.audience.capabilities,
          users: [
            // Remove the ID of the user being added from the audiece, to prevent duplicates
            ...this.audience.users
              .map((o) => o._id)
              .filter((v) => v !== this.selectedUser._id),
            // Add the ID of the user being added
            this.selectedUser._id,
          ],
        };
        console.log(payload);
        axios
          .put(`http://localhost:8787/api/audience`, payload, {
            headers: { Authorization: localStorage.getItem("JWT") },
          })
          .then((response) => {
            this.audience = response.data.data;
            this.selectedUser = null;
            this.suggestedUsers = [];
          })
          .catch((error) => {
            console.error(error.response);
            swal.fire(
              "Uh-oh.",
              "There has been an unexpected error adding a person to this Audience. Please try again."
            );
            if (error.response.status === 401) {
              console.log("Destroying invalid session");
              window.location.assign("/logout");
            }
          });
      }
    },
    _handleDeleteUserFromAudienceClick(userIdToDelete) {
      if (userIdToDelete) {
        const payload = {
          _id: this.audience._id,
          name: this.audience.name,
          capabilities: this.audience.capabilities,
          users: this.audience.users
            .map((o) => o._id)
            .filter((v) => v !== userIdToDelete),
        };
        console.log(payload);
        axios
          .put(`http://localhost:8787/api/audience`, payload, {
            headers: { Authorization: localStorage.getItem("JWT") },
          })
          .then((response) => {
            console.log(response.data);
            this.audience = response.data.data;
            this.selectedUser = null;
            this.users = [];
          })
          .catch((error) => {
            console.error(error.response);
            swal.fire(
              "Uh-oh.",
              "There has been an unexpected error deleting a person from this Audience. Please try again."
            );
            if (error.response.status === 401) {
              console.log("Destroying invalid session");
              window.location.assign("/logout");
            }
          });
      }
    },
    _handleAudienceNameEditButtonClick() {
      this.newAudienceName = this.audience.name;
      this.editingName = true;
    },
    _handleAudienceNameSaveButtonClick() {
      if (this.newAudienceName && this.newAudienceName.length) {
        if (this.newAudienceName.toLowerCase() === "everyone") {
          swal.fire(
            "Hold up.",
            "You've already got an Audience called 'Everyone'. I beg of you, don't make this confusing for yourself."
          );
          return false;
        }
        const payload = {
          _id: this.audience._id,
          name: this.newAudienceName,
          capabilities: this.audience.capabilities,
          users: this.audience.users.map((o) => o._id),
        };
        console.log(payload);
        axios
          .put(`http://localhost:8787/api/audience`, payload, {
            headers: { Authorization: localStorage.getItem("JWT") },
          })
          .then((response) => {
            this.audience = response.data.data;
            this.selectedUser = null;
            this.users = [];
            this.editingName = false;
          })
          .catch((error) => {
            console.error(error.response);
            swal.fire(
              "Uh-oh.",
              "There has been an unexpected error editing this Audience. Please try again."
            );
            if (error.response.status === 401) {
              console.log("Destroying invalid session");
              window.location.assign("/logout");
            }
          });
      }
    },
    _handleAudienceDeleteButtonClick() {
      swal
        .fire({
          text:
            "Are you sure you want to delete this Audience? This action cannot be undone.",
          showCancelButton: true,
          confirmButtonColor: "#ed5e5e",
          cancelButtonColor: "#e8e8e8",
          confirmButtonText: "Delete",
        })
        .then((result) => {
          if (result.isConfirmed) {
            axios
              .delete(`http://localhost:8787/api/audience`, {
                headers: { Authorization: localStorage.getItem("JWT") },
                data: { _id: this.audience._id },
              })
              .then((response) => {
                this.deleteAudience(this.audience._id);
              })
              .catch((error) => {
                console.error(error);
                swal.fire(
                  "Uh-oh.",
                  "There has been an unexpected error deleting this Audience. Please try again."
                );
                if (error.response.status === 401) {
                  console.log("Destroying invalid session");
                  window.location.assign("/logout");
                }
              });
          }
        });
    },
  },
  mounted() {
    this.fetchUsers = this.debounce(this.fetchUsers, 1000);
  },
};
</script>

<style scoped>
.select__option {
  display: flex;
  align-items: center;
}
.select__avatar {
  height: 24px;
  width: 24px;
  border-radius: 3px;
  margin-right: 5px;
}
.select__display-name {
  font-weight: bold;
  margin-right: 5px;
}
.v-select {
  flex: 1;
}
</style>