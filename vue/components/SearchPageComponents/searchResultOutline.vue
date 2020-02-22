<template>
    <div class="col commentContent">
          <p class="text-muted"><slot name="typeLabel">type of search result here</slot></p>
          <p class="mb-2" style="font-size:1.3em">
              <img class="postAuthorImage" v-bind:src="image" />
              <slot name="title">search result title goes here</slot>
          </p>
            <slot name="description">search result description goes here</slot>
        </div>
</template>

<script>
export default {
    props: ['image']
}
</script>