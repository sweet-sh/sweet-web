<template>
  <div>
    <div v-for="comm in list" :key="comm._id" class="content-box">
      <div class="row">
        <div class="col commentContent">
          <p class="mb-2" style="font-size:1.3em">
            <img
              class="postAuthorImage"
              :src="'/images/communities/' + (comm.imageEnabled ? comm.image: 'cake.svg')"
            >
            <strong><a class="authorLink" :href="'/community/' + comm.slug">
              {{ comm.name }}
            </a></strong>
            &middot;
            <span class="text-muted">
              {{ comm.membersCount + " member" + (comm.membersCount === 1 ? "" : "s") }}
            </span>
          </p>
          <p v-html="comm.descriptionParsed" />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    list: {
      type: Array,
      required: true
    }
  }
}
</script>
