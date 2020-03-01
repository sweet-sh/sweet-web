<template>
  <div class="page-load-status">
    <div v-if="loading" class="loader-ellips infinite-scroll-request">
      <span class="loader-ellips__dot" />
      <span class="loader-ellips__dot" />
      <span class="loader-ellips__dot" />
      <span class="loader-ellips__dot" />
    </div>
    <p v-else>
      {{ message }}
    </p>
  </div>
</template>

<script>
export default {
  props: {
    loading: Boolean,
    message: {
      type: String,
      default: 'No more items found.'
    }
  }
}
</script>
