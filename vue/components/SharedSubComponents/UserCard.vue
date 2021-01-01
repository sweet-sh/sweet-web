<template>
  <div class="user-card">
    <button
      v-if="deleteCallback"
      type="button"
      class="user-card__delete-button"
      @click="deleteCallback(user._id)"
      :content="`Remove @${user.username} from this Audience`"
      v-tippy
    >
      <i class="far fa-times"></i>
    </button>
    <div class="user-card__avatar">
      <img
        v-bind:alt="`Profile image of @${user.username}`"
        :src="
          user.imageEnabled
            ? `https://sweet-images.s3.eu-west-2.amazonaws.com/${user.image}`
            : `/images/cake.svg`
        "
      />
    </div>
    <div class="user-card__name">
      <span v-if="user.displayName" class="user-card__display-name">
        {{ user.displayName }}
      </span>
      <span class="user-card__username">
        @{{ user.username }}
        <i
          v-if="user.flagged"
          class="fas fa-exclamation-triangle user-card__flag"
        ></i>
      </span>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {};
  },
  props: {
    user: Object,
    deleteCallback: Function,
  },
  methods: {},
};
</script>