<template>
  <div class="image-lightbox__overlay" tabindex="0" @keydown.esc="_hideImageLightbox" @click.self="_hideImageLightbox">
    <div class="image-lightbox__container">
      <hooper :settings="hooperSettings" @slide="updateSidebar">
        <slide
          class="image-lightbox__slide"
          v-for="image in lightboxImages"
          :key="image.src"
          :index="image.src"
        >
          <div class="image-lightbox__image-frame">
            <img
              class="image-lightbox__image"
              v-lazy="image.src.startsWith('/api/image/display') ? image.src : ('/api/image/display/' + image.src.replace('images/', ''))"
            />
          </div>
        </slide>
        <navigation slot="hooper-addons"></navigation>
        <pagination slot="hooper-addons"></pagination>
      </hooper>
      <div class="image-lightbox__info">
        <button class="image-lightbox__close-button" type="button" @click="_hideImageLightbox"><i class="fal fa-times"></i></button>
        <p class="image-lightbox__caption">{{ caption }}</p>
        <div class="image-lightbox__author" v-if="author">
          <a v-bind:href="`/${author.username}`">
            <img
              class="author-image"
              v-bind:alt="`Profile image of @${author.username}`"
              v-lazy="author.imageEnabled ? `https://sweet-images.s3.eu-west-2.amazonaws.com/${author.image}` : `/images/cake.svg`"
            />
          </a>
          <div class="author-name">
            <span v-if="author.displayName" class="author-display-name">
              <a v-bind:href="`/${author.username}`">{{ author.displayName }}</a>
            </span>
            <span class="author-username">
              <a
                v-if="!author.displayName"
                v-bind:href="`/${author.username}`"
              >@{{ author.username }}</a>
              <span v-else>@{{ author.username }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { Hooper, Slide, Pagination, Navigation } from "hooper";
import "hooper/dist/hooper.css";
// import Glide from "@glidejs/glide";
// import "@glidejs/glide/dist/css/glide.core.css";

export default {
  components: {
    Hooper,
    Slide,
    Pagination,
    Navigation
  },
  props: {
    showImageLightbox: Boolean,
    _hideImageLightbox: Function,
    lightboxImages: Array,
    author: Object
  },
  data() {
    return {
      hooperSettings: {
        itemsToShow: 1,
        centerMode: true,
        // infiniteScroll: true
      },
      caption: ""
    };
  },
  computed: {},
  methods: {
    updateSidebar(event) {
      this.caption = this.lightboxImages[event.currentSlide].alt;
    }
  },
  watch: {},
  beforeMount() {},
  beforeDestroy() {},
  created() {},
  mounted() {
    this.caption = this.lightboxImages[0].alt;
  }
};
</script>