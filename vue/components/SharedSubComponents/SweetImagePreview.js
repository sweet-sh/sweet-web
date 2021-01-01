import { Node } from 'tiptap'
import axios from "axios";
import swal from "sweetalert2";

export default class SweetImagePreview extends Node {
  get name() {
    return 'sweet_image_preview'
  }

  get schema() {
    return {
      // here you have to specify all values that can be stored in this node
      attrs: {
        src: {
          default: null
        },
        thumbnail: {
          default: null
        },
        alt: {
          default: null
        }
      },
      group: 'block',
      draggable: true,
      // parseDOM and toDOM is still required to make copy and paste work
      parseDOM: [
        {
          tag: 'sweet-image-preview',
          getAttrs: dom => ({
            src: dom.getAttribute('src'),
            alt: dom.getAttribute('alt'),
            thumbnail: dom.getAttribute('data-thumbnail')
          })
        }
      ],
      toDOM: node => [
        'sweet-image-preview',
        {
          src: node.attrs.src,
          alt: node.attrs.alt,
          'data-thumbnail': node.attrs.thumbnail
        }
      ]
    }
  }

  // return a vue component
  // this can be an object or an imported component
  get view() {
    return {
      // there are some props available
      // `node` is a Prosemirror Node Object
      // `updateAttrs` is a function to update attributes defined in `schema`
      // `view` is the ProseMirror view instance
      // `options` is an array of your extension options
      // `selected` is a boolean which is true when selected
      // `editor` is a reference to the TipTap editor instance
      // `getPos` is a function to retrieve the start position of the node
      // `decorations` is an array of decorations around the node
      props: ['node', 'updateAttrs', 'view'],
      computed: {
        src: {
          get() {
            return this.node.attrs.src
          },
          set(src) {
            // we cannot update `src` itself because `this.node.attrs` is immutable
            this.updateAttrs({
              src
            })
          }
        },
        alt: {
          get() {
            return this.node.attrs.alt
          },
          set(alt) {
            this.updateAttrs({
              alt
            })
          }
        },
        thumbnail: {
          get() {
            return this.node.attrs.thumbnail
          },
          set(thumbnail) {
            this.updateAttrs({
              thumbnail
            })
          }
        }
      },
      template: `
        <div class="post-editor-image">
          <img class="post-editor-image__image" :src="thumbnail" />
          <div class="post-editor-image__controls">
            <button type="button" @click="_handleRotateImageCW($event, src)"><i class="far fa-redo"></i></button>
            <button type="button" @click="_handleRotateImageCCW($event, src)"><i class="far fa-undo"></i></button>
          </div>
          <textarea class="post-editor-image__text" v-model="alt" v-if="view.editable" @paste.stop placeholder="Describe this image for people using screen readers"/>
          <div class="post-editor-image__draghandle" data-drag-handle><i class="far fa-bars"></i></div>
        </div>
      `,
      methods: {
        _handleRotateImageCCW(event, src) {
          console.log('CCW');
          console.log(src);
          axios
            .post("http://localhost:8787/api/image/rotate", {
              key: src,
              direction: 'ccw'
            }, {
              headers: {
                Authorization: localStorage.getItem("JWT"),
              }
            })
            .then(response => {
              console.log(response);
              this.updateAttrs({
                thumbnail: response.data.data.thumbnail
              })
            })
            .catch(error => {
              console.error(error.response);
              swal.fire(
                "Uh-oh.",
                "There has been an unexpected error rotating this image. Please try again."
              );
              if (error.response.status === 401) {
                console.log("Destroying invalid session");
                window.location.assign("/logout");
              }
            });
        },
        _handleRotateImageCW(event, src) {
          console.log('CW');
          console.log(src);
          axios
            .post("http://localhost:8787/api/image/rotate", {
              key: src,
              direction: 'cw'
            }, {
              headers: {
                Authorization: localStorage.getItem("JWT"),
              }
            })
            .then(response => {
              console.log(response);
              this.updateAttrs({
                thumbnail: response.data.data.thumbnail
              })
            })
            .catch(error => {
              console.error(error.response);
              swal.fire(
                "Uh-oh.",
                "There has been an unexpected error rotating this image. Please try again."
              );
              if (error.response.status === 401) {
                console.log("Destroying invalid session");
                window.location.assign("/logout");
              }
            });
        }
      }
    }
  }

  commands({ type }) {
    return attrs => (state, dispatch) => {
      const { selection } = state
      const position = selection.$cursor
        ? selection.$cursor.pos
        : selection.$to.pos
      const node = type.create(attrs)
      const transaction = state.tr.insert(position, node)
      dispatch(transaction)
    }
  }
}
