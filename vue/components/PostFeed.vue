<template>
  <div>
    <div class="post-feed__container" v-if="userData">
      <article
        v-if="postAllowed"
        v-for="post in posts"
        v-bind:key="post._id"
        class="post"
        v-bind:data-post-id="post._id"
      >
        <aside
          v-if="(post.boostBlame || post.community) && context !== 'community'"
          class="notifications"
        >
          <div v-if="post.boostBlame" class="boosters-notification">
            <i class="fas fa-retweet"></i>
            <img
              class="user-image-sm"
              v-bind:alt="`Profile image of @${post.boostBlame.culprit.username}`"
              v-lazy="post.boostBlame.culprit.imageEnabled ? `https://sweet-images.s3.eu-west-2.amazonaws.com/${post.boostBlame.culprit.image}` : `/images/cake.svg`"
            /> Boosted by
            <a
              v-bind:href="`/${post.boostBlame.culprit.username}`"
            >{{ post.boostBlame.culprit._id === userId ? 'you' : (post.boostBlame.culprit.displayName || '@' + post.boostBlame.culprit.username) }}</a>
          </div>
          <div
            v-if="post.viewingContext !== 'community' && post.community"
            class="community-notification"
          >
            <img
              class="user-image-sm"
              v-bind:alt="`Display image for the community '${post.community.name}'`"
              v-lazy="post.community.imageEnabled ? `https://sweet-images.s3.eu-west-2.amazonaws.com/${post.community.image}` : `/images/communities/cake.svg`"
            />
            <span>
              Posted in
              <a
                v-bind:href="`/community/${post.community.slug}`"
              >{{ post.community.name }}</a>
            </span>
          </div>
        </aside>
        <header>
          <div class="post-header-left">
            <a v-bind:href="`/${post.author.username}`">
              <img
                class="author-image"
                v-bind:alt="`Profile image of @${post.author.username}`"
                v-lazy="post.author.imageEnabled ? `https://sweet-images.s3.eu-west-2.amazonaws.com/${post.author.image}` : `/images/cake.svg`"
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
              <span v-if="post.lastEdited">
                &nbsp;&middot;&nbsp;
                <span class="post-edited">Edited</span>
              </span>
              &nbsp;&middot;&nbsp;
              <span class="post-visibility">
                <i v-if="post.type === 'draft'" class="fas fa-pencil-ruler"></i>
                <i v-if="post.privacy === 'public'" class="fas fa-eye"></i>
                <i v-if="post.privacy === 'private'" class="fas fa-eye-slash"></i>
              </span>
            </aside>
          </div>
        </header>
        <section v-if="post.editModeEnabled" class="content">
          <post-editor
            :mode="'post'"
            :postEditorVisible="true"
            :editPostData="post"
            :destroyEditingEditor="destroyEditingEditor"
          ></post-editor>
        </section>
        <section
          v-if="!post.editModeEnabled"
          v-bind:class="'content ' + (post.contentWarnings ? 'content-warning-post' : '')"
        >
          <div v-if="post.contentWarnings">
            <aside class="content-warning">
              <i class="fas fa-exclamation-circle"></i>
              {{post.contentWarnings}}
            </aside>
            <div
              class="abbreviated-content content-warning-content"
              style="height:0"
              :is="dynamicPostBody(processPostBody(post.jsonBody))"
              :author="post.author"
            ></div>
            <button
              type="button"
              class="button grey-button content-warning-show-more uppercase-button"
              data-state="contracted"
            >Show post</button>
          </div>
          <div v-else :is="dynamicPostBody(processPostBody(post.jsonBody))" :author="post.author"></div>
          <div v-if="post.tags" class="post__tags-container">
            <a
              v-for="tag in post.tags"
              v-bind:key="tag"
              :href="`/tag/${tag}`"
              class="post__tag"
            >#{{ tag }}</a>
          </div>
        </section>
        <footer class="toolbar">
          <div class="toolbar-button-container">
            <button
              type="button"
              v-bind:class="'button post-toolbar-button tooltip-top' + (post.havePlused ? ' have-plused' : '')"
              v-bind:data-tooltip="(post.havePlused ? 'Unsupport ' : 'Support ') + 'this post'"
              @click="_handleSupportButtonClick($event, post)"
            >
              <span v-show="post.havePlused">
                <i class="plus-icon fas fa-hands-helping"></i>
                {{ post.author._id === userId ? (post.numberOfPluses > 0 ? post.numberOfPluses : '') : ''}}
              </span>
              <span v-show="!post.havePlused">
                <i class="plus-icon far fa-hands-helping"></i>
                {{ post.author._id === userId ? (post.numberOfPluses > 0 ? post.numberOfPluses : '') : ''}}
              </span>
            </button>
          </div>
          <div v-if="!post.commentsDisabled && post.canReply" class="toolbar-button-container">
            <button
              type="button"
              class="button post-toolbar-button tooltip-top"
              :data-tooltip="(post.commentsVisible ? 'Hide' : 'Show') + ' post comments'"
              @click="toggleComments($event, post)"
            >
              <i class="far fa-comment"></i>
              <span v-if="post.numberOfComments" class="comments-number">{{post.numberOfComments}}</span>
            </button>
          </div>
          <div
            v-if="post.privacy === 'public' && userData.loggedIn && post.type !== 'community'"
            class="toolbar-button-container"
          >
            <button
              type="button"
              class="button post-toolbar-button tooltip-top"
              :data-tooltip="(post.boostsV2.some(o => o.booster._id === userData._id) ? 'Unboost' : 'Boost') + ' this post'"
              @click="_handleBoostButtonClick($event, post)"
            >
              <span
                v-if="post.boostsV2.some(o => o.booster._id === userData._id)"
                class="fa-layers fa-fw"
              >
                <i class="fas fa-retweet"></i>
                <i class="fas fa-slash" data-fa-transform="rotate-90"></i>
              </span>
              <i v-else class="fas fa-retweet"></i>
            </button>
          </div>
          <div class="toolbar-button-container">
            <a
              class="button post-toolbar-button tooltip-top"
              :href="`${post.author.username}/${post.url}`"
              data-tooltip="Permalink to this post"
            >
              <span class="fa-layers">
                <i class="fas fa-bars" data-fa-transform="shrink-8"></i>
                <i class="far fa-sticky-note"></i>
              </span>
            </a>
          </div>
          <div v-show="post.subscribedUsers.includes(userId)" class="toolbar-button-container">
            <button
              type="button"
              class="button post-toolbar-button tooltip-top"
              data-tooltip="Receiving notifications (click to change)"
              @click="_handleUnsubscribeButtonClick($event, post)"
            >
              <i class="far fa-bell"></i>
            </button>
          </div>
          <div v-show="!post.subscribedUsers.includes(userId)" class="toolbar-button-container">
            <button
              type="button"
              class="button post-toolbar-button tooltip-top"
              data-tooltip="Not receiving notifications (click to change)"
              @click="_handleSubscribeButtonClick($event, post)"
            >
              <i class="far fa-bell-slash"></i>
            </button>
          </div>
          <div v-if="post.author._id === userId" class="toolbar-button-container dropdown">
            <button
              id="post-extra-controls-dropdown"
              class="button post-toolbar-button"
              type="button"
              data-toggle="dropdown"
              aria-haspopup="true"
              aria-expanded="false"
            >
              <i class="fa fa-bars"></i>
            </button>
            <div class="dropdown-menu" aria-labelledby="post-extra-controls-dropdown">
              <button
                type="button"
                class="dropdown-item"
                @click="_handleEditPostButtonClick($event, post)"
              >
                <i class="fas fa-fw fa-pencil-alt"></i> Edit post
              </button>
              <button
                type="button"
                class="dropdown-item"
                @click="_handleDeletePostButtonClick($event, post)"
              >
                <i class="far fa-fw fa-trash-alt"></i> Delete post
              </button>
            </div>
          </div>
        </footer>
        <section
          v-if="!post.commentsDisabled"
          class="comments"
          v-show="post.commentsVisible || openAllComments"
        >
          <div class="comments-container">
            <comment-tree
              v-for="comment in post.comments"
              v-bind:key="comment._id"
              :comment="comment"
              :postId="post._id"
              :parsePostTimestamp="parsePostTimestamp"
              :processPostBody="processPostBody"
            ></comment-tree>
          </div>
          <post-editor v-if="post.canReply" :mode="'comment'" :parentPost="post._id"></post-editor>
        </section>
      </article>
      <image-lightbox
        v-if="lightboxImages && showImageLightbox"
        :lightboxImages="lightboxImages"
        :_hideImageLightbox="() => showImageLightbox = false"
        :author="lightboxAuthor"
      />
      <div v-if="!postAllowed">Nope!</div>
    </div>
    <loading-spinner :loading="loading" :message="loadingMessage" />
  </div>
</template>

<script>
import Vue from "vue";
import VueLazyload from "vue-lazyload";
import { EventBus } from "./SharedSubComponents/EventBus";
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
import CommentTree from "./SharedSubComponents/CommentTree.vue";
import loadingSpinner from "./SharedSubComponents/loadingSpinner.vue";
import ImageLightbox from "./ImageLightbox.vue";
import PostEditor from "./PostEditor.vue";
import swal from "sweetalert2";

Vue.use(VueLazyload);

export default {
  components: {
    CommentTree,
    PostEditor,
    loadingSpinner,
    ImageLightbox
  },
  data() {
    return {
      // Post feed
      oldestTimestamp: Date.now(),
      newestTimestamp: Date.now(),
      posts: [],
      loading: true,
      loadingMessage: "",
      postAllowed: true,
      // Image lightbox
      showImageLightbox: false,
      lightboxImages: [],
      lightboxAuthor: null,
      // Session
      JWT: localStorage.getItem("JWT"),
      userData: null,
      userId: this.parseJWT(localStorage.getItem("JWT")).id,
      // Constants
      today: moment()
        .clone()
        .startOf("day"),
      thisYear: moment()
        .clone()
        .startOf("year")
    };
  },
  props: {
    context: String,
    openAllComments: Boolean
  },
  computed: {
    feedEndpoint: function() {
      const parsedUrl = new URL(window.location.href);
      let contextType, context;
      switch (this.context) {
        case "tag":
          contextType = "tag";
          context = parsedUrl.pathname
            .split("/")
            .filter(v => v && v !== "tag")
            .join();
          break;
        case "user":
          contextType = "user";
          context = parsedUrl.pathname
            .split("/")
            .filter(v => v && v !== "user")
            .join();
          break;
        case "single":
          contextType = "url";
          context = parsedUrl.pathname
            .split("/")
            .filter(v => v && v !== "user")[1];
          break;
        case "community":
          contextType = "community";
          context = parsedUrl.pathname
            .split("/")
            .filter(v => v && v !== "community");
          break;
        default:
          contextType = "home";
          break;
      }
      return [`http://localhost:8787/api/posts/${contextType}/`, `/${context}`];
    }
  },
  methods: {
    dynamicPostBody(html, author) {
      return {
        template: html,
        props: {
          author: Object
        }
      };
    },
    _handleImageClick(event, payload, author) {
      event.preventDefault();
      this.lightboxImages = payload;
      this.lightboxAuthor = author;
      this.showImageLightbox = true;
    },
    destroyEditingEditor(postId) {
      const affectedPost = this.posts.find(post => post._id === postId);
      // Destroys the editor which is editing a post.
      Vue.set(affectedPost, "editModeEnabled", false);
    },
    toggleComments(event, post) {
      if (post.commentsVisible) {
        post.commentsVisible = false;
      } else if (!post.commentsVisible) {
        Vue.set(post, "commentsVisible", true);
      }
    },
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
    parsePostTimestamp(time) {
      let parsedTimestamp;
      if (moment(time).isSame(this.today, "d")) {
        parsedTimestamp = moment(time).fromNow();
      } else if (moment(time).isSame(this.thisYear, "y")) {
        parsedTimestamp = moment(time).format("D MMM");
      } else {
        parsedTimestamp = moment(time).format("D MMM YYYY");
      }
      return parsedTimestamp;
    },
    processPostBody(jsonBody) {
      const div = document.createElement("div");
      const node = Node.fromJSON(schema, jsonBody);
      const serializedFragment = serializer.serializeFragment(node);
      div.appendChild(serializedFragment);
      return div.outerHTML;
    },
    getInitialPosts() {
      this.loading = true;
      axios
        .get(`${this.feedEndpoint[0]}${Date.now()}${this.feedEndpoint[1]}`, {
          headers: { Authorization: localStorage.getItem("JWT") }
        })
        .then(response => {
          this.loading = false;
          this.posts = response.data.data;
          console.log(response.data.data);
          this.oldestTimestamp = Date.parse(
            response.data.data[response.data.data.length - 1].lastUpdated
          );
        })
        .catch(error => {
          this.loading = false;
          if (error.response.status === 404) {
            this.loadingMessage = "No more posts.";
          }
        });
    },
    scroll() {
      window.onscroll = () => {
        let bottomOfWindow =
          document.documentElement.scrollTop + window.innerHeight ===
          document.documentElement.offsetHeight;
        if (bottomOfWindow) {
          // console.log(
          //   `${this.feedEndpoint[0]}${Date.now()}${this.feedEndpoint[1]}`
          // );
          this.loading = true;
          axios
            .get(
              `${this.feedEndpoint[0]}${this.oldestTimestamp}${this.feedEndpoint[1]}`,
              {
                headers: { Authorization: localStorage.getItem("JWT") }
              }
            )
            .then(response => {
              this.loading = false;
              // Filter out posts that already exist
              const payload = response.data.data.filter(
                post =>
                  !this.posts.some(
                    existingPost => existingPost._id === post._id
                  )
              );
              if (payload.length) {
                this.posts = [...this.posts, ...payload];
                this.oldestTimestamp = Date.parse(
                  response.data.data[response.data.data.length - 1].lastUpdated
                );
              }
            })
            .catch(error => {
              this.loading = false;
              if (error.response.status === 404) {
                this.loadingMessage = "No more posts.";
              }
            });
        }
      };
    },
    _handleSupportButtonClick(event, post) {
      axios({
        // method: post.havePlused ? 'DELETE' : 'GET',
        method: "POST",
        url: `http://localhost:8787/api/plus/${post._id}`,
        headers: { Authorization: localStorage.getItem("JWT") }
        // data: { postid: post._id }
      })
        .then(response => {
          post.havePlused = !post.havePlused;
          if (post.havePlused) {
            Vue.set(post, "numberOfPluses", ++post.numberOfPluses);
          } else {
            Vue.set(post, "numberOfPluses", --post.numberOfPluses);
          }
        })
        .catch(error => {
          console.error(error.response);
          swal.fire(
            "Uh-oh.",
            "There has been an unexpected error supporting/unsupporting this post. Please try again."
          );
        });
    },
    _handleBoostButtonClick(event, post) {
      axios({
        method: "POST",
        url: `http://localhost:8787/api/boost/${post._id}`,
        headers: { Authorization: localStorage.getItem("JWT") }
      })
        .then(response => {
          const boostBlame = {
            reason: "ownBoost",
            culprit: {
              ...this.userData.profileData,
              _id: this.userId
            }
          };
          Vue.set(post, "boostBlame", boostBlame);
        })
        .catch(error => {
          console.error(error);
          swal.fire(
            "Uh-oh.",
            "There has been an unexpected error boosting/unboosting this post. Please try again."
          );
        });
    },
    _handleSubscribeButtonClick(event, post) {
      axios
        .post(
          `http://localhost:8787/api/subscription`,
          { postId: post._id },
          { headers: { Authorization: localStorage.getItem("JWT") } }
        )
        .then(response => {
          post.subscribedUsers.push(this.userId);
          Vue.set(post, "subscribedUsers", post.subscribedUsers);
        })
        .catch(error => {
          console.error(error);
          swal.fire(
            "Uh-oh.",
            "There has been an unexpected error subscribing to this post. Please try again."
          );
        });
    },
    _handleUnsubscribeButtonClick(event, post) {
      axios
        .delete(`http://localhost:8787/api/subscription`, {
          headers: { Authorization: localStorage.getItem("JWT") },
          data: { postId: post._id }
        })
        .then(response => {
          const subscribedUsers = post.subscribedUsers.filter(
            v => v !== this.userId
          );
          Vue.set(post, "subscribedUsers", subscribedUsers);
        })
        .catch(error => {
          console.error(error);
          swal.fire(
            "Uh-oh.",
            "There has been an unexpected error unsubscribing from this post. Please try again."
          );
        });
    },
    _handleDeletePostButtonClick(event, post) {
      swal
        .fire({
          text:
            "Are you sure you want to delete this post? This action cannot be undone.",
          showCancelButton: true,
          confirmButtonColor: "#ed5e5e",
          cancelButtonColor: "#e8e8e8",
          confirmButtonText: "Delete"
        })
        .then(result => {
          if (result.isConfirmed) {
            axios
              .delete(`http://localhost:8787/api/post`, {
                headers: { Authorization: localStorage.getItem("JWT") },
                data: { postId: post._id }
              })
              .then(response => {
                this.posts = this.posts.filter(o => o._id !== post._id);
              })
              .catch(error => {
                console.error(error);
                swal.fire(
                  "Uh-oh.",
                  "There has been an unexpected error deleting this post. Please try again."
                );
              });
          }
        });
    },
    _handleEditPostButtonClick(event, post) {
      if (!post.editModeEnabled) {
        Vue.set(post, "editModeEnabled", true);
      }
    },
    _handleClick() {
      console.log("Foo!");
    }
  },
  watch: {},
  async created() {},
  beforeMount() {
    // Log out user if we don't have the JWT token in localStorage
    // if (!localStorage.getItem("JWT")) {
    //   window.location.assign("/logout");
    // }
    axios
      .get(`http://localhost:8787/api/user/${this.userId}`, {
        headers: { Authorization: localStorage.getItem("JWT") }
      })
      .then(response => {
        this.userData = response.data.data;
      });
    this.getInitialPosts();
  },
  mounted() {
    this.scroll();
    EventBus.$on("post-created", post => {
      this.getInitialPosts();
    });
    // This event controls top-level comments, which are pushed into post objects.
    // For child-level comments, see CommentTree.
    EventBus.$on(
      "comment-created",
      ({ parentPost, parentComment, comment }) => {
        if (!parentComment) {
          const parentPostObject = this.posts.find(o => o._id === parentPost);
          parentPostObject.comments.push(comment);
          parentPostObject.numberOfComments++;
          parentPostObject.commentsVisible = true;
        }
      }
    );
    EventBus.$on("post-edited", editedPost => {
      console.log("Edited post event!");
      this.posts.forEach((post, index, array) => {
        if (post._id === editedPost._id) {
          this.posts.splice(index, 1, editedPost);
        }
      });
    });
  },
  beforeDestroy() {}
};
</script>