<template>
  <article
    class="comment"
    v-bind:data-comment-id="comment._id"
    v-bind:id="`comment-${comment._id}`"
    v-if="comment.canDisplay"
  >
    <header>
      <img
        v-bind:alt="`Profile image of @${comment.author.username}`"
        class="author-image"
        v-lazy="comment.author.imageEnabled ? `https://sweet-images.s3.eu-west-2.amazonaws.com/${comment.author.image}` : `/images/cake.svg`"
      />
      <div class="comment-header-container">
        <h3 class="author-name">
          <span v-if="comment.author.displayName" class="author-display-name">
            <a v-bind:href="`/${comment.author.username}`">{{ comment.author.displayName }}</a>
          </span>
          <span class="author-username">
            <a
              v-if="!comment.author.displayName"
              v-bind:href="`/${comment.author.username}`"
            >@{{ comment.author.username }}</a>
            <span v-else>@{{ comment.author.username }}</span>
          </span>
          <i v-if="comment.authorFlagged" class="fas fa-exclamation-triangle user-flag"></i>
        </h3>
        <div class="comment-header-divider">&middot;</div>
        <aside class="timestamp">{{ parsePostTimestamp(comment.timestamp) }}</aside>
      </div>
    </header>
    <section class="content" v-html="processPostBody(comment.jsonBody)"></section>
    <footer class="toolbar">
      <button
        v-if="comment.canReply && depth <= 5"
        type="button"
        class="button comment-toolbar-button reply-to-comment"
        @click="_handleReplyClick"
      >Reply</button>
      <button
        v-if="comment.canDelete"
        type="button"
        class="button comment-toolbar-button delete-comment"
        v-bind:id="comment._id"
        v-bind:data-comment-id="comment._id"
        @click="_handleDeleteClick"
      >Delete</button>
    </footer>
    <section class="replies" v-if="comment.replies && comment.replies.length">
      <reply
        v-for="reply in comment.replies"
        v-bind:key="reply._id"
        :postId="postId"
        :comment="reply"
        :parsePostTimestamp="parsePostTimestamp"
        :processPostBody="processPostBody"
        :depth="depth+1"
      ></reply>
    </section>
    <div class="new-comment-form" ref="replyEditorContainerRef" v-show="this.replyEditorShown" :mode="'comment'"></div>
  </article>
  <article v-else class="comment" v-bind:data-comment-id="comment._id">
    <section v-if="comment.deleted" class="content comment-deleted-content">
      <p class="comment-deleted-message">Comment deleted</p>
    </section>
    <section v-if="comment.muted" class="content comment-muted-content">
      <p class="comment-muted-message">Comment hidden</p>
    </section>
    <section class="replies" v-if="comment.replies && comment.replies.length">
      <reply
        v-for="reply in comment.replies"
        v-bind:key="reply._id"
        :comment="reply"
        :postId="postId"
        :parsePostTimestamp="parsePostTimestamp"
        :processPostBody="processPostBody"
        :depth="depth+1"
      ></reply>
    </section>
    <div class="new-comment-form" ref="replyEditorContainerRef" v-show="this.replyEditorShown"></div>
  </article>
</template>

<script>
import Vue from "vue";
import { EventBus } from "./EventBus";
import axios from "axios";
import swal from "sweetalert2";
import PostEditor from "../PostEditor.vue";
export default {
  name: "reply",
  props: {
    postId: String,
    comment: Object,
    parsePostTimestamp: Function,
    processPostBody: Function
  },
  data() {
    return {
      replyEditorCreated: false,
      replyEditorShown: false,
      depth: 1
    };
  },
  methods: {
    _handleReplyClick() {
      if (this.replyEditorCreated) {
        this.replyEditorShown = !this.replyEditorShown;
      } else {
        let ComponentClass = Vue.extend(PostEditor);
        let instance = new ComponentClass({
          propsData: {
            mode: "comment",
            parentPost: this.postId,
            parentComment: this.comment._id
          }
        });
        instance.$mount(); // pass nothing
        this.$refs.replyEditorContainerRef.appendChild(instance.$el);
        this.replyEditorCreated = true;
        this.replyEditorShown = true;
      }
    },
    _handleDeleteClick() {
      // DEBUG: Update number of comments!
      swal
        .fire({
          text: "Are you sure you want to delete this comment?",
          showCancelButton: true,
          confirmButtonColor: "#ed5e5e",
          cancelButtonColor: "#e8e8e8",
          confirmButtonText: "Delete"
        })
        .then(result => {
          if (result.isConfirmed) {
            axios
              .delete("https://apiv2.sweet.sh/api/comment", {
                headers: { Authorization: localStorage.getItem("JWT") },
                data: { postId: this.postId, commentId: this.comment._id }
              })
              .then(response => {
                this.comment.canDisplay = false;
                this.comment.deleted = true;
              })
              .catch(error => {
                console.error(error.response);
                swal.fire(
                  "Uh-oh.",
                  "There has been an unexpected error deleting this comment. Please try again."
                );
              });
          }
        });
    }
  },
  mounted() {
    // This event controls child-level comments, which are pushed into comment reply objects.
    // For top-level comments, see PostFeed.
    EventBus.$on(
      "comment-created",
      ({ parentPost, parentComment, comment }) => {
        if (parentPost === this.postId && parentComment && parentComment === this.comment._id) {
          if (this.comment.replies) {
            this.comment.replies.push(comment);
          } else {
            this.comment.replies = [comment];
          }
        }
      }
    );
  }
};
</script>