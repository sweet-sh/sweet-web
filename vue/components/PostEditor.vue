<template>
  <div class="post-editor__container">
    <div class="editor">
      <editor-menu-bar :editor="editor" v-slot="{ commands, isActive, getMarkAttrs }">
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

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.underline() }"
            @click="commands.underline"
          >
            <i class="far fa-underline"></i>
          </button>

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.code() }"
            @click="commands.code"
          >
            <i class="far fa-code"></i>
          </button>

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
            <i class="far fa-file-code"></i>
          </button>

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.link() }"
            @click="showLinkMenu(getMarkAttrs('link'))"
          >
            <i class="fas fa-link"></i>
          </button>

          <button
            class="menubar__button"
            :class="{ 'is-active': isActive.sweetImagePreview() }"
            @click="showImagePrompt"
          >
            <i class="fas fa-image"></i>
          </button>

          <input
            type="file"
            accept="image/gif, image/jpeg, image/png"
            aria-label="Choose image"
            id="post-editor__imagepicker"
            name="post-editor__imagepicker"
            multiple
            style="display:none;"
            @change="handleFileChange($event, commands.sweetImagePreview)"
          />

          <div class="dropdown" style="display: inline;">
            <button
              class="menubar__button"
              type="button"
              id="emojiPickerButton"
              data-toggle="dropdown"
              aria-haspopup="true"
              aria-expanded="false"
            >
              <i class="far fa-smile"></i>
            </button>
            <div
              class="dropdown-menu"
              aria-labelledby="emojiPickerButton"
              style="padding:0!important;"
            >
              <Picker set="emojione" v-bind:showPreview="false" @select="addEmoji" />
            </div>
          </div>
        </div>
      </editor-menu-bar>
      <editor-menu-bar :editor="editor" v-slot="{ commands }">
        <form
          class="post-editor__link-menubar"
          v-if="linkMenuIsActive"
          @submit.prevent="setLinkUrl(commands.link, linkUrl)"
        >
          <input
            class="foo"
            type="text"
            v-model="linkUrl"
            placeholder="https://"
            ref="linkInput"
            @keydown.esc="hideLinkMenu"
          />
          <button class="menubar__button" @click="setLinkUrl(commands.link, null)" type="button">
            <i class="far fa-trash-alt"></i>
          </button>
        </form>
      </editor-menu-bar>
      <div class="post-editor__inputs-container">
        <editor-content class="editor__content post-editor__content" :editor="editor" />
        <TagInput />
      </div>
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
          <img class="tribute-image" v-bind:src="user.image" />
          <strong v-if="user.displayName">{{ user.displayName }} &middot;</strong>
          <span
            v-bind:style="{ fontWeight: user.displayName ? 'regular' : 'bold' }"
          >@{{ user.username }}</span>
        </div>
      </template>
      <div v-else class="suggestion-list__item is-empty">No users found</div>
    </div>
    <pre><code v-html="json"></code></pre>
    <p></p>
    <pre><code style="white-space: normal;">{{ html }}</code></pre>
    <p>JWT: <code>{{ JWT }}</code></p>
    <pre><code v-html="editor.getSchemaJSON()"></code></pre>
  </div>
</template>

<script>
import Fuse from "fuse.js";
import tippy, { sticky } from "tippy.js";
import axios from "axios";
import TagInput from "./SharedSubComponents/TagInput.vue";
import SweetImagePreview from "./SharedSubComponents/SweetImagePreview";
import { Picker } from "emoji-mart-vue";
import { Editor, EditorContent, EditorMenuBar, EditorMenuBubble } from "tiptap";
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
  TrailingNode
} from "tiptap-extensions";
export default {
  components: {
    EditorContent,
    EditorMenuBar,
    EditorMenuBubble,
    Picker,
    TagInput
  },
  data() {
    return {
      editor: new Editor({
        extensions: [
          new Blockquote(),
          new BulletList(),
          new CodeBlock(),
          new HorizontalRule(),
          new ListItem(),
          new OrderedList(),
          new Link({
            openOnClick: false
          }),
          new Bold(),
          new Code(),
          new Italic(),
          new Underline(),
          new History(),
          new Mention({
            // a list of all suggested items
            items: async () => {
              const usersPayload = await axios.get("/api/v2/user");
              return usersPayload.data;
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
                keys: ["displayName", "username"]
              });
              return fuse.search(query).map(item => item.item);
            }
          }),
          new Placeholder({
            emptyEditorClass: "is-editor-empty",
            emptyNodeClass: "is-empty",
            emptyNodeText: "What would you like to say?",
            showOnlyWhenEditable: true,
            showOnlyCurrent: true
          }),
          new SweetImagePreview(),
          new TrailingNode({
            node: "paragraph",
            notAfter: ["paragraph"]
          })
        ],
        onUpdate: ({ getJSON, getHTML }) => {
          this.json = getJSON();
          this.html = getHTML();
        }
      }),
      // Link adder functionality
      linkUrl: null,
      linkMenuIsActive: false,
      // Suggestion functionality
      query: null,
      suggestionRange: null,
      filteredUsers: [],
      navigatedUserIndex: 0,
      insertMention: () => {},
      // Export
      json: "",
      html: "",
      // Session
      JWT: localStorage.getItem('JWT')
    };
  },
  computed: {
    hasResults() {
      return this.filteredUsers.length;
    },
    showSuggestions() {
      return this.query || this.hasResults;
    }
  },
  methods: {
    showLinkMenu(attrs) {
      this.linkUrl = attrs.href;
      this.linkMenuIsActive = true;
      this.$nextTick(() => {
        this.$refs.linkInput.focus();
      });
    },
    hideLinkMenu() {
      this.linkUrl = null;
      this.linkMenuIsActive = false;
    },
    setLinkUrl(command, url) {
      command({ href: url });
      this.hideLinkMenu();
    },
    addEmoji(emoji) {
      console.log(emoji.native);
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
        }
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
        duration: [400, 200]
      });
    },
    destroyPopup() {
      if (this.popup) {
        this.popup[0].destroy();
        this.popup = null;
      }
    },
    showImagePrompt(command) {
      $("#post-editor__imagepicker").click();
    },
    handleFileChange(event, command) {
      console.log(event);
      console.log(command);
      let files = event.target.files;
      // Make an AJAX request for each file
      $.each(files, function (index, file) {
        let formData = new FormData();
        formData.append('image', file);
        console.log(formData.getAll('image'))
        axios.post('http://localhost:8787/api/image', formData, {
            headers: {
              'Authorization': localStorage.getItem('JWT'),
              'Content-Type': 'multipart/form-data'
            }
        })
        .then((response) => {
          command({ thumbnail: response.data.data.thumbnail, src: response.data.data.imageKey });
        })
      });
      // Wipe the image picker's data
      $('#post-editor__imagepicker').val('');
    }
  },
  beforeDestroy() {
    this.destroyPopup();
    this.editor.destroy();
  }
};
</script>