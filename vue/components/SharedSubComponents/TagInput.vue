<template>
  <div class="tag-input">
    <div v-for="(tag, index) in tags" :key="tag" class="tag-input__tag">
      #{{ tag }}
      <button @click="removeTag(index)" type="button">
        <i class="far fa-times"></i>
      </button>
    </div>
    <span class="tag-input__text-container">
      <span class="tag-input__text-prefix" v-bind:style="{ color: this.currentTag.length ? 'black' : 'inherit' }">#</span><input
        type="text"
        placeholder="tags"
        class="tag-input__text"
        v-model="currentTag"
        @keydown.enter="addTag"
        @keydown.space="addTag"
        @keydown.188="addTag"
        @keydown.delete="removeLastTag"
      />
    </span>
  </div>
</template>
<script>
export default {
  data() {
    return {
      tags: [],
      currentTag: ''
    };
  },
  methods: {
    addTag(event) {
      event.preventDefault();
      var val = this.currentTag.trim();
      if (val.length > 0) {
        this.tags.push(val);
        this.currentTag = "";
      }
    },
    removeTag(index) {
      this.tags.splice(index, 1);
    },
    removeLastTag(event) {
      if (this.currentTag.length === 0) {
        this.removeTag(this.tags.length - 1);
      }
    }
  }
};
</script>