<template>
  <div class="post-feed__container">
    <article
      v-for="post in posts"
      v-bind:key="post._id"
      class="post"
      v-bind:data-post-id="post._id"
    >
      <header>
        <div class="post-header-left">
          <a v-bind:href="`/${post.author.username}`">
            <img
              class="author-image"
              v-bind:alt="`Profile image of @${post.author.username}`"
              v-bind:src="post.author.imageEnabled ? `https://sweet-images.s3.amazonaws.com/${post.author.image}` : `/images/cake.svg`"
            />
          </a>
        </div>
        <div class="post-header-right">
          <h2 class="author-name">
            <span v-if="post.author.displayName" class="author-display-name">
              <a v-bind:href="`/${post.author.username}`">{{ post.author.displayName }}</a>
            </span>
            <span class="author-username">
              <a
                v-if="!post.author.displayName"
                v-bind:href="`/${post.author.username}`"
              >@{{ post.author.username }}</a>
              <span v-else>@{{ post.author.username }}</span>
            </span>
            <i v-if="post.authorFlagged" class="fas fa-exclamation-triangle user-flag"></i>
          </h2>
          <aside class="metadata">
            <span class="post-timestamp">{{ parsePostTimestamp(post.timestamp) }}</span>
            &nbsp;&middot;&nbsp;
            <span class="post-visibility">
              <i v-if="post.type === 'draft'" class="fas fa-pencil-ruler"></i>
              <i v-if="post.privacy === 'public'" class="fas fa-eye"></i>
              <i v-if="post.privacy === 'private'" class="fas fa-eye-slash"></i>
            </span>
            <span v-if="post.lastEdited">
              &nbsp;&middot;&nbsp;
              <span class="post-edited">Edited</span>
            </span>
          </aside>
        </div>
      </header>
      <section class="content" v-html="processPostBody(post.jsonBody)"></section>
    </article>
  </div>
</template>

<script>
import axios from "axios";
import moment from "moment";
import {
  Schema,
  DOMParser,
  DOMSerializer,
  Node,
  Fragment
} from "prosemirror-model";
import { schema } from "./SharedSubComponents/schema";
const serializer = DOMSerializer.fromSchema(schema);

export default {
  components: {},
  data() {
    return {
      // Post feed
      oldestTimestamp: Date.now(),
      newestTimestamp: Date.now(),
      posts: [],
      // Session
      JWT: localStorage.getItem("JWT"),
      // Constants
      today: moment().clone().startOf('day'),
      thisYear: moment().clone().startOf('year')
    };
  },
  computed: {},
  methods: {
    parsePostTimestamp(time) {
      let parsedTimestamp;
      if (moment(time).isSame(this.today, 'd')) {
        parsedTimestamp = moment(time).fromNow()
      } else if (moment(time).isSame(this.thisYear, 'y')) {
        parsedTimestamp = moment(time).format('D MMM')
      } else {
        parsedTimestamp = moment(time).format('D MMM YYYY')
      }
      return parsedTimestamp;
    },
    processPostBody(jsonBody) {
      const div = document.createElement("div");
      const node = Node.fromJSON(schema, jsonBody);
      const serializedFragment = serializer.serializeFragment(node);
      div.appendChild(serializedFragment);
      return div.innerHTML;
    },
    getInitialPosts() {
      axios
        .get(`http://localhost:8787/api/posts/home/${this.oldestTimestamp}`, {
          headers: { Authorization: localStorage.getItem("JWT") }
        })
        .then(response => {
          console.log("Initial load");
          this.posts = response.data.data;
          console.log(response.data.data);
          this.oldestTimestamp = Date.parse(
            response.data.data[response.data.data.length - 1].lastUpdated
          );
          console.log(this.oldestTimestamp);
        });
    },
    scroll() {
      window.onscroll = () => {
        let bottomOfWindow =
          document.documentElement.scrollTop + window.innerHeight ===
          document.documentElement.offsetHeight;
        if (bottomOfWindow) {
          axios
            .get(
              `http://localhost:8787/api/posts/home/${this.oldestTimestamp}`,
              {
                headers: { Authorization: localStorage.getItem("JWT") }
              }
            )
            .then(response => {
              console.log("Scroll load");
              // Filter out posts that already exist
              const payload = response.data.data.filter(
                post =>
                  !this.posts.some(
                    existingPost => existingPost._id === post._id
                  )
              );
              this.posts = [...this.posts, ...payload];
              this.oldestTimestamp = Date.parse(
                response.data.data[response.data.data.length - 1].lastUpdated
              );
              console.log(this.oldestTimestamp);
            });
        }
      };
    }
  },
  watch: {},
  beforeMount() {
    this.getInitialPosts();
  },
  mounted() {
    this.scroll();
  },
  beforeDestroy() {}
};
</script>