<template>
  <div class="post-editor__wrapper">
    <div
      class="post-editor__fake-editor"
      v-show="mode === 'post' && !postEditorVisible"
      @click="
        postEditorVisible = true;
        editor.focus();
      "
    >
      What would you like to say?
    </div>
    <div
      class="editor"
      v-show="(mode === 'post' && postEditorVisible) || mode === 'comment'"
    >
      <editor-menu-bar
        :editor="editor"
        v-slot="{ commands, isActive, getMarkAttrs }"
      >
        <div class="menubar">
          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.bold() }"
            @click="commands.bold"
          >
            <i class="far fa-bold"></i>
          </button>

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.italic() }"
            @click="commands.italic"
          >
            <i class="far fa-italic"></i>
          </button>

          <!-- <button
            class="menubar__button"
            :class="{ 'is-active': isActive.underline() }"
            @click="commands.underline"
          >
            <i class="far fa-underline"></i>
          </button>-->

          <!-- <button
            class="menubar__button"
            :class="{ 'is-active': isActive.code() }"
            @click="commands.code"
          >
            <i class="far fa-code"></i>
          </button>-->

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.bullet_list() }"
            @click="commands.bullet_list"
          >
            <i class="far fa-list-ul"></i>
          </button>

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.ordered_list() }"
            @click="commands.ordered_list"
          >
            <i class="far fa-list-ol"></i>
          </button>

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.blockquote() }"
            @click="commands.blockquote"
          >
            <i class="fas fa-quote-left"></i>
          </button>

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.code_block() }"
            @click="commands.code_block"
          >
            <i class="far fa-code"></i>
          </button>

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.sweet_link_preview() }"
            @click="showLinkMenu"
          >
            <i class="fas fa-link"></i>
          </button>

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.sweet_image_preview() }"
            @click="$refs.imagePickerRef.click()"
          >
            <i class="fas fa-image"></i>
          </button>

          <input
            type="file"
            accept="image/gif, image/jpeg, image/png"
            aria-label="Choose image"
            class="post-editor__imagepicker"
            name="post-editor__imagepicker"
            multiple
            style="display: none"
            @change="handleFileChange($event, commands.sweet_image_preview)"
            ref="imagePickerRef"
          />
          <button
            class="menubar__button"
            type="button"
            id="emojiPickerButton"
            data-toggle="dropdown"
            aria-haspopup="true"
            aria-expanded="false"
            @click="_handleEmojiButtonClick"
          >
            <i class="far fa-smile"></i>
          </button>
        </div>
      </editor-menu-bar>
      <editor-menu-bar :editor="editor" v-slot="{ commands }">
        <form
          class="post-editor__link-menubar"
          v-if="linkMenuIsActive"
          @submit.prevent="setLinkUrl(commands.sweet_link_preview, linkUrl)"
        >
          <input
            style="flex: 1; background: #fff"
            type="text"
            v-model="linkUrl"
            placeholder="http://endless.horse/"
            ref="linkInput"
            @keydown.esc="hideLinkMenu"
          />
          <button style="width: auto" type="submit" class="menubar__button">
            <span v-if="linkPreviewLoading">
              <i class="fas fa-spinner-third fa-pulse"></i>
            </span>
            <span v-else>
              <i class="far fa-check"></i>
            </span>
          </button>
          <button class="menubar__button" @click="hideLinkMenu" type="button">
            <i class="far fa-times"></i>
          </button>
        </form>
      </editor-menu-bar>
      <Picker
        v-if="emojiPickerVisible"
        set="google"
        :data="emojiIndex"
        v-bind:showPreview="true"
        :title="''"
        @select="addEmoji"
      />
      <div class="post-editor__inputs-container">
        <div class="post-editor__content-wrapper">
          <editor-content
            class="editor__content post-editor__content"
            :editor="editor"
          />
          <transition name="fade">
            <div class="post-editor__toast" v-show="toastMessage">
              <i class="fas fa-spinner-third fa-pulse"></i>
              &nbsp;&nbsp;{{ toastMessage ? toastMessage : "" }}
            </div>
          </transition>
        </div>
        <TagInput v-if="mode === 'post'" :tags="tags" />
        <div v-if="mode === 'post'" class="post-editor__input-wrapper">
          <i class="fa fa-exclamation-circle text-muted"></i>
          <input
            type="text"
            placeholder="Content warning"
            v-model="contentWarning"
            class="post-editor__input post-editor__input--no-border post-editor__input--padding"
          />
        </div>
      </div>
    </div>
    <div
      v-if="mode === 'post' && context !== 'community'"
      class="post-editor__audience-selector"
      v-show="(mode === 'post' && postEditorVisible) || mode === 'comment'"
    >
      <span class="post-editor__audience-selector__heading">
        <i class="fas fa-user-friends" style="margin-right: 0.25rem"></i>
        Audiences
      </span>
      <v-select
        multiple
        :value="selectedAudiences"
        @input="setSelectedAudiences"
        label="name"
        :options="audiences"
        :closeOnSelect="false"
        placeholder="No audiences selected"
      />
      <p class="small text-muted" style="margin-top: 0.25rem">
        Choose who can see this post. Posts marked <strong>Everyone</strong> can
        be seen by everyone on Sweet. Other posts can be seen only by the
        Audiences to which they belong.
      </p>
    </div>
    <div
      class="post-editor__buttons-toolbar"
      v-show="(mode === 'post' && postEditorVisible) || mode === 'comment'"
    >
      <button
        type="button"
        class="button grey-button post-editor__button"
        v-show="(mode === 'post' && postEditorVisible) || mode === 'comment'"
        @click="destroyEditor()"
      >
        Cancel
      </button>
      <button
        type="button"
        class="button post-editor__button"
        v-show="(mode === 'post' && postEditorVisible) || mode === 'comment'"
        @click="_handlePostButtonClick"
      >
        {{ editPostData ? "Edit" : mode === "post" ? "Post" : "Reply" }}
      </button>
    </div>
    <div class="suggestion-list" v-show="showSuggestions" ref="suggestions">
      <template v-if="hasResults">
        <div
          v-for="(user, index) in filteredUsers"
          :key="user.id"
          class="suggestion-list__item"
          :class="{ 'is-selected': navigatedUserIndex === index }"
          @click="selectUser(user)"
        >
          <img class="suggestion-list__image" v-bind:src="user.image" />
          <strong v-if="user.displayName"
            >{{ user.displayName }} &middot;</strong
          >
          <span
            v-bind:style="{ fontWeight: user.displayName ? 'regular' : 'bold' }"
            >@{{ user.username }}</span
          >
        </div>
      </template>
      <div v-else class="suggestion-list__item is-empty">No users found</div>
    </div>
    <!-- <p>Audiences: {{ selectedAudience }}</p> -->
    <!-- <pre><code v-html="json"></code></pre> -->
    <!-- <p></p> -->
    <!-- <pre><code style="white-space: normal;">{{ html }}</code></pre> -->
    <!-- <p>
      JWT:
      <code>{{ JWT }}</code>
    </p>-->
  </div>
</template>

<script>
import { EventBus } from "./SharedSubComponents/EventBus";
import Fuse from "fuse.js";
import tippy, { sticky } from "tippy.js";
import axios from "axios";
import vSelect from "vue-select";
import "vue-select/dist/vue-select.css";
import TagInput from "./SharedSubComponents/TagInput.vue";
import SweetImagePreview from "./SharedSubComponents/SweetImagePreview";
import SweetLinkPreview from "./SharedSubComponents/SweetLinkPreview";
import {
  Editor,
  EditorContent,
  EditorMenuBar,
  EditorMenuBubble,
  Extension,
} from "tiptap";
import swal from "sweetalert2";

import emojiData from "emoji-mart-vue-fast/data/google.json";
import { Picker, EmojiIndex } from "emoji-mart-vue-fast";
import "emoji-mart-vue-fast/css/emoji-mart.css";

import {
  Blockquote,
  CodeBlock,
  HorizontalRule,
  OrderedList,
  BulletList,
  ListItem,
  Bold,
  Code,
  Italic,
  Link,
  Underline,
  History,
  Mention,
  Placeholder,
  TrailingNode,
} from "tiptap-extensions";

export default {
  components: {
    EditorContent,
    EditorMenuBar,
    EditorMenuBubble,
    Picker,
    TagInput,
    vSelect,
  },
  props: {
    mode: { type: String, default: "post" },
    editMode: { type: Boolean, default: false },
    editPostData: Object,
    parentPost: String,
    parentComment: String,
    context: String,
    contextId: String,
    postEditorVisible: { type: Boolean, default: false },
    destroyEditingEditor: Function,
  },
  data() {
    const vm = this;
    return {
      editor: new Editor({
        extensions: [
          new Blockquote(),
          new BulletList(),
          new CodeBlock(),
          new HorizontalRule(),
          new ListItem(),
          new OrderedList(),
          new SweetLinkPreview(),
          new Bold(),
          new Code(),
          new Italic(),
          new Link(),
          new Underline(),
          new History(),
          new Mention({
            // a list of all suggested items
            items: async () => {
              // console.log("Fetching users for suggestions list");
              const usersPayload = await axios.get(
                "http://localhost:8787/api/users/all",
                { headers: { Authorization: localStorage.getItem("JWT") } }
              );
              return usersPayload.data.data;
            },
            // is called when a suggestion starts
            onEnter: ({ items, query, range, command, virtualNode }) => {
              this.query = query;
              this.filteredUsers = items;
              this.suggestionRange = range;
              this.renderPopup(virtualNode);
              // we save the command for inserting a selected mention
              // this allows us to call it inside of our custom popup
              // via keyboard navigation and on click
              this.insertMention = command;
            },
            // is called when a suggestion has changed
            onChange: ({ items, query, range, virtualNode }) => {
              this.query = query;
              this.filteredUsers = items;
              this.suggestionRange = range;
              this.navigatedUserIndex = 0;
              this.renderPopup(virtualNode);
            },
            // is called when a suggestion is cancelled
            onExit: () => {
              // reset all saved values
              this.query = null;
              this.filteredUsers = [];
              this.suggestionRange = null;
              this.navigatedUserIndex = 0;
              this.destroyPopup();
            },
            // is called on every keyDown event while a suggestion is active
            onKeyDown: ({ event }) => {
              if (event.key === "ArrowUp") {
                this.upHandler();
                return true;
              }
              if (event.key === "ArrowDown") {
                this.downHandler();
                return true;
              }
              if (event.key === "Enter") {
                this.enterHandler();
                return true;
              }
              return false;
            },
            // is called when a suggestion has changed
            // this function is optional because there is basic filtering built-in
            // you can overwrite it if you prefer your own filtering
            // in this example we use fuse.js with support for fuzzy search
            onFilter: async (items, query) => {
              if (!query) {
                return items;
              }
              const fuse = new Fuse(items, {
                threshold: 0.2,
                keys: ["displayName", "username"],
              });
              return fuse.search(query).map((item) => item.item);
            },
          }),
          new Placeholder({
            emptyEditorClass: "is-editor-empty",
            emptyNodeClass: "is-empty",
            emptyNodeText: "What would you like to say?",
            showOnlyWhenEditable: true,
            showOnlyCurrent: true,
          }),
          new SweetImagePreview(),
          new TrailingNode({
            node: "paragraph",
            notAfter: ["paragraph"],
          }),
          new (class extends Extension {
            keys({ type }) {
              return {
                "Ctrl-Enter": function () {
                  vm._handlePostButtonClick();
                },
              };
            }
          })(),
        ],
        onUpdate: ({ getJSON, getHTML }) => {
          this.json = getJSON();
          this.html = getHTML();
          localStorage.setItem(`postAutosave`, this.html);
        },
        content: this.editPostData
          ? this.processPostBodyForEditor(this.editPostData.jsonBody)
          : null,
        onDrop: (view, event, slice, moved) => {
          console.log(event);
          let hasFiles = false;
          let files = [];
          if (event.dataTransfer.items) {
            console.log("Got items");
            for (var i = 0; i < event.dataTransfer.items.length; i++) {
              if (
                event.dataTransfer.items[i].kind === "file" &&
                event.dataTransfer.items[i].type.indexOf("image") === 0
              ) {
                files.push(event.dataTransfer.items[i].getAsFile());
              }
            }
          } else {
            console.log("Got files");
            for (var i = 0; i < event.dataTransfer.files.length; i++) {
              if (event.dataTransfer.files[i].type.indexOf("image") === 0) {
                files.push(event.dataTransfer.files[i]);
              }
            }
          }
          console.log(files);
          files.forEach((currentValue, index, array) => {
            hasFiles = true;
            console.log("Processing copied image item");
            this.toastMessage = `Uploading image${
              files.length > 1 ? "s" : ""
            }...`;
            let formData = new FormData();
            formData.append("image", currentValue);
            axios
              .post("http://localhost:8787/api/image", formData, {
                headers: {
                  Authorization: localStorage.getItem("JWT"),
                  "Content-Type": "multipart/form-data",
                },
              })
              .then((response) => {
                console.log();
                if (index >= array.length - 1) {
                  this.toastMessage = false;
                }
                this.editor.commands.sweet_image_preview({
                  thumbnail: response.data.data.thumbnail,
                  src: response.data.data.imageKey,
                });
              })
              .catch((error) => {
                this.toastMessage = false;
                console.error(error);
                console.error(error.response);
                swal.fire(
                  "Uh-oh.",
                  "There has been an unexpected error uploading this image. Please try again."
                );
                if (error.response.status === 401) {
                  console.log("Destroying invalid session");
                  window.location.assign("/logout");
                }
              });
          });
          if (hasFiles) {
            event.preventDefault();
            return true;
          }
        },
        onPaste: () => {
          let hasFiles = false;
          const files = Array.from(event.clipboardData.files).filter((item) =>
            item.type.startsWith("image")
          );
          files.forEach((currentValue, index, array) => {
            hasFiles = true;
            console.log("Processing copied image item");
            this.toastMessage = `Uploading image${
              files.length > 1 ? "s" : ""
            }...`;
            let formData = new FormData();
            formData.append("image", currentValue);
            axios
              .post("http://localhost:8787/api/image", formData, {
                headers: {
                  Authorization: localStorage.getItem("JWT"),
                  "Content-Type": "multipart/form-data",
                },
              })
              .then((response) => {
                console.log();
                if (index >= array.length - 1) {
                  this.toastMessage = false;
                }
                this.editor.commands.sweet_image_preview({
                  thumbnail: response.data.data.thumbnail,
                  src: response.data.data.imageKey,
                });
              })
              .catch((error) => {
                this.toastMessage = false;
                console.error(error);
                console.error(error.response);
                swal.fire(
                  "Uh-oh.",
                  "There has been an unexpected error uploading this image. Please try again."
                );
                if (error.response.status === 401) {
                  console.log("Destroying invalid session");
                  window.location.assign("/logout");
                }
              });
          });
          if (hasFiles) {
            event.preventDefault();
            return true;
          }
        },
      }),
      // User data
      userData: null,
      // Secondary post data
      contentWarning: this.editPostData
        ? this.editPostData.contentWarnings
        : null,
      tags: this.editPostData ? this.editPostData.tags : [],
      audiences: [],
      selectedAudiences: [],
      // Link adder functionality
      linkUrl: null,
      linkMenuIsActive: false,
      linkPreviewLoading: false,
      // Suggestion functionality
      query: null,
      suggestionRange: null,
      filteredUsers: [],
      navigatedUserIndex: 0,
      insertMention: () => {},
      // Export
      json: null,
      html: "",
      // Session
      JWT: localStorage.getItem("JWT"),
      // Emoji
      emojiIndex: new EmojiIndex(emojiData),
      emojiPickerVisible: false,
      // Status and error messages
      toastMessage: false,
    };
  },
  computed: {
    hasResults() {
      return this.filteredUsers.length;
    },
    showSuggestions() {
      return this.query || this.hasResults;
    },
  },
  methods: {
    parseJWT(token) {
      if (!token) {
        return false;
      }
      var base64Url = token.split(".")[1];
      var base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      var jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map(function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
      return JSON.parse(jsonPayload);
    },
    processPostBodyForEditor(body) {
      // This is necessary because we need to unpack the gallery>image objects back into
      // sweet_image_preview objects for the editor.
      if (body.content) {
        const parsedContent = [];
        body.content.forEach((node, index, array) => {
          if (node.type === "gallery") {
            node.content.forEach((imageNode) => {
              imageNode.type = "sweet_image_preview";
              imageNode.attrs.thumbnail = `/api/image/display/${imageNode.attrs.src.replace(
                "images/",
                ""
              )}`;
              parsedContent.push(imageNode);
            });
          } else {
            parsedContent.push(node);
          }
        });
        body.content = parsedContent;
      }
      return body;
    },
    showLinkMenu() {
      this.linkMenuIsActive = true;
      this.$nextTick(() => {
        this.$refs.linkInput.focus();
      });
    },
    hideLinkMenu() {
      this.linkUrl = null;
      this.linkMenuIsActive = false;
      this.linkPreviewLoading = false;
    },
    setLinkUrl(command, url) {
      this.linkPreviewLoading = true;
      this.toastMessage = "Loading link preview...";
      axios
        .post(
          "http://localhost:8787/api/url-metadata/",
          { url: url || "http://endless.horse" },
          { headers: { Authorization: localStorage.getItem("JWT") } }
        )
        .then((response) => {
          this.toastMessage = false;
          const {
            url,
            embedUrl,
            title,
            description,
            image,
            domain,
          } = response.data.data;
          command({ url, embedUrl, title, description, image, domain });
          this.hideLinkMenu();
        })
        .catch((error) => {
          this.toastMessage = false;
          console.error(error.response);
          swal.fire(
            "Uh-oh.",
            "There has been an unexpected error creating this link preview. Please double check the link and try again."
          );
          if (error.response.status === 401) {
            console.log("Destroying invalid session");
            window.location.assign("/logout");
          }
        });
    },
    addEmoji(emoji) {
      const transaction = this.editor.state.tr.insertText(emoji.native);
      this.editor.view.dispatch(transaction);
      this.editor.focus();
    },
    // navigate to the previous item
    // if it's the first item, navigate to the last one
    upHandler() {
      this.navigatedUserIndex =
        (this.navigatedUserIndex + this.filteredUsers.length - 1) %
        this.filteredUsers.length;
    },
    // navigate to the next item
    // if it's the last item, navigate to the first one
    downHandler() {
      this.navigatedUserIndex =
        (this.navigatedUserIndex + 1) % this.filteredUsers.length;
    },
    enterHandler() {
      const user = this.filteredUsers[this.navigatedUserIndex];
      if (user) {
        this.selectUser(user);
      }
    },
    // we have to replace our suggestion text with a mention
    // so it's important to pass also the position of your suggestion text
    selectUser(user) {
      this.insertMention({
        range: this.suggestionRange,
        attrs: {
          id: user.id,
          label: user.username,
        },
      });
      this.editor.focus();
    },
    // renders a popup with suggestions
    // tiptap provides a virtualNode object for using popper.js (or tippy.js) for popups
    renderPopup(node) {
      if (this.popup) {
        return;
      }
      // ref: https://atomiks.github.io/tippyjs/v6/all-props/
      this.popup = tippy("body", {
        getReferenceClientRect: node.getBoundingClientRect,
        appendTo: () => document.body,
        interactive: true,
        sticky: true, // make sure position of tippy is updated when content changes
        plugins: [sticky],
        content: this.$refs.suggestions,
        trigger: "mouseenter", // manual
        showOnCreate: true,
        theme: "light",
        placement: "top-start",
        inertia: true,
        duration: [400, 200],
      });
    },
    destroyPopup() {
      if (this.popup) {
        this.popup[0].destroy();
        this.popup = null;
      }
    },
    handleFileChange(event, command) {
      let files = event.target.files;
      this.toastMessage = `Uploading image${files.length > 1 ? "s" : ""}...`;
      // Make an AJAX request for each file
      $.each(files, (index, file) => {
        let formData = new FormData();
        formData.append("image", file);
        axios
          .post("http://localhost:8787/api/image", formData, {
            headers: {
              Authorization: localStorage.getItem("JWT"),
              "Content-Type": "multipart/form-data",
            },
          })
          .then((response) => {
            if (index >= files.length - 1) {
              this.toastMessage = false;
            }
            command({
              thumbnail: response.data.data.thumbnail,
              src: response.data.data.imageKey,
            });
          })
          .catch((error) => {
            this.toastMessage = false;
            console.error(error.response);
            swal.fire(
              "Uh-oh.",
              "There has been an unexpected error uploading this image. Please try again."
            );
            if (error.response.status === 401) {
              console.log("Destroying invalid session");
              window.location.assign("/logout");
            }
          });
      });
      // Wipe the image picker's data
      $(".post-editor__imagepicker").val("");
    },
    preventUnload(event) {
      if (this.json !== null) {
        event.preventDefault();
        return true;
      }
      return false;
    },
    _handleEmojiButtonClick() {
      this.emojiPickerVisible = !this.emojiPickerVisible;
    },
    async _handlePostButtonClick() {
      const newJSON = this.editor.getJSON();
      if (newJSON !== null) {
        const getCommunityId = async () => {
          const parsedUrl = new URL(window.location.href);
          let communitySlug = parsedUrl.pathname
            .split("/")
            .filter((v) => v && v !== "community");
          let response = await axios
            .get(`http://localhost:8787/api/communities/${communitySlug}`, {
              headers: { Authorization: localStorage.getItem("JWT") },
            })
            .then((response) => {
              return response.data.data._id;
            })
            .catch((error) => {
              if (error.response.status === 401) {
                console.log("Destroying invalid session");
                window.location.assign("/logout");
              }
            });
          console.log(response);
          return response;
        };
        const payload = {
          postId: this.editPostData ? this.editPostData._id : null, // Only for editing posts
          context: this.context,
          contextId:
            this.context === "community" ? await getCommunityId() : null,
          parentPost: this.parentPost, // Only for creating comments
          parentComment: this.parentComment, // Only for creating comments
          body: newJSON,
          contentWarning: this.contentWarning,
          tags: this.tags,
          audiences: this.selectedAudiences,
        };
        console.log(payload);
        // Three options here:
        // - POST to /api/post (new post)
        // - POST to /api/comment (new comment)
        // - PUT to /api/post (editing post)
        // Editing comments is not yet implemented.
        axios({
          url: `http://localhost:8787/api/${this.mode}`,
          method: this.editPostData ? "PUT" : "POST",
          data: payload,
          headers: { Authorization: localStorage.getItem("JWT") },
        })
          .then((response) => {
            console.log(response.data);
            this.resetEditor();
            if (this.mode === "post") {
              // Notify the post feed to get it to update
              EventBus.$emit(
                this.editPostData ? "post-edited" : "post-created",
                response.data.data
              );
            } else if (this.mode === "comment") {
              // Notify the comment tree to get it to update
              EventBus.$emit("comment-created", response.data.data);
            }
          })
          .catch((error) => {
            console.error(error.response);
            swal.fire(
              "Uh-oh.",
              "There has been an unexpected error creating this post. Please try again."
            );
            if (error.response.status === 401) {
              console.log("Destroying invalid session");
              window.location.assign("/logout");
            }
          });
      } else {
        swal.fire("Uh-oh.", "You appear to be trying to post nothing. Why?");
      }
    },
    setSelectedAudiences(maybeSelectedAudiences) {
      // First check if the new audience is empty - in that case, it's always set to 'Everyone'
      if (!maybeSelectedAudiences || maybeSelectedAudiences.length === 0) {
        this.selectedAudiences = this.audiences.filter(
          (o) => o._id === "everyone"
        );
      } else {
        // Get the element which has just been added (it's always last)
        const newAudience =
          maybeSelectedAudiences[maybeSelectedAudiences.length - 1];
        // If we're adding 'Everyone', we need to remove all the others...
        if (newAudience._id === "everyone") {
          this.selectedAudiences = this.audiences.filter(
            (o) => o._id === "everyone"
          );
          // ...otherwise, we remove 'Everyone'.
        } else {
          this.selectedAudiences = maybeSelectedAudiences.filter(
            (o) => o._id !== "everyone"
          );
        }
      }
    },
    resetEditor() {
      // Reset the post editor
      this.editor.clearContent();
      this.json = null;
      this.html = "";
      this.tags = [];
      this.contentWarning = null;
      this.selectedAudiences = null;
      this.emojiPickerVisible = false;
      this.postEditorVisible = false;
    },
    destroyEditor() {
      // If it's editing an existing post or creating a comment
      if (
        (this.editPostData && this.editPostData._id) ||
        this.mode === "comment"
      ) {
        this.resetEditor();
        // If it's editing an existing post...
        if (this.editPostData) {
          // ...destroy it at the post feed level
          this.destroyEditingEditor(this.editPostData._id);
        }
      }
      // If it's creating a new post just reset it
      if (this.mode === "post") {
        this.resetEditor();
      }
    },
  },
  beforeMount() {
    window.addEventListener("beforeunload", this.preventUnload);
    const userId = this.parseJWT(localStorage.getItem("JWT")).id;
    axios
      .get(`http://localhost:8787/api/user/${userId}`, {
        headers: { Authorization: localStorage.getItem("JWT") },
      })
      .then((response) => {
        this.userData = response.data.data.profileData;
        // Fetch the user's current Audiences and set the initial Audience
        axios
          .get("http://localhost:8787/api/audience", {
            headers: { Authorization: localStorage.getItem("JWT") },
          })
          .then((response) => {
            // Set user audiences
            this.audiences = [
              ...response.data.data,
              { _id: "everyone", name: "Everyone" },
            ];
            // Set initial audiences
            // If we're editing a post, the selected audience is set on the post
            if (this.editPostData) {
              if (this.editPostData.visibleToEveryone === true) {
                // This post has the 'Everyone' audience
                this.selectedAudiences = [{ _id: "everyone", name: "Everyone" }];
              } else {
                // Map the list of audience IDs into real audience objects
                this.selectedAudiences = this.editPostData.audiences.map(v => this.audiences.find(o => o._id === v));
              }
            }
            // If we're creating a new post, the default selected audience
            // is set in the user's settings
            else if (this.userData && this.userData.settings && this.userData.settings.defaultAudience) {
              this.selectedAudiences = this.audiences.find(o => o._id === this.userData.settings.defaultAudience);
            }
            // Fall back to 'Everyone'
            else {
              this.selectedAudiences = [{ _id: "everyone", name: "Everyone" }];
            }
          });
      })
      .catch((error) => {
        if (error.response && error.response.status === 401) {
          console.log("Destroying invalid session");
          window.location.assign("/logout");
        }
      });
  },
  beforeDestroy() {
    window.removeEventListener("beforeunload", this.preventUnload);
    this.destroyPopup();
    this.editor.destroy();
  },
};
</script>