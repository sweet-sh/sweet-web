<template>
  <div>
    <p>
      Fill out this form to create a new community. Although you are the community's creator, on sweet all
      members of a community are equal, and there are no administrators or moderators. This means that you
      should make the choices below carefully, because after the community is created, you will only be able
      to change them by a majority vote!
    </p>

    <div
      v-if="warning !== ''"
      class="message warning"
      style="max-width: 500px; margin: 1rem auto 0 auto;"
    >
      {{ warning }}
    </div>

    <form @submit.prevent="formSubmitted">
      <div class="form-group">
        <label for="communityName">Name</label>
        <input
          type="text"
          class="form-control"
          name="communityName"
          maxlength="80"
          required
          v-model="name"
        >
      </div>
      <div class="form-group">
        Your community's URL will be: <span class="text-info">{{ 'https://sweet.sh/community/' + slug }}</span>
      </div>
      <div class="form-group">
        <label for="communityDescription">Description</label>
        <div class="form-control editable-text" style="height:auto;" ref="communityDescriptionHTML" />
      </div>
      <div class="form-group">
        <label for="communityRules">Rules</label>
        <div class="form-control editable-text" style="height:auto;" ref="communityRulesHTML">
          Please follow the guidelines laid out in the Community Covenant, available to read here:
          https://community-covenant.net/version/1/0/
        </div>
      </div>
      <div class="form-group">
        <label for="communityVisibility">Post visibility</label>
        <select class="form-control" name="communityVisibility">
          <option value="public">
            Public (posts visible to all sweet users)
          </option>
          <option value="private">
            Private (posts visible only to members)
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="communityJoinType">Joining method</label>
        <select class="form-control" name="communityJoinType">
          <option value="open">
            Open (anyone is free to join)
          </option>
          <option value="approval">
            Approval (requests to join must be approved by a current member)
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="communityVoteLength">Vote length</label>
        <select class="form-control" name="communityVoteLength">
          <option value="1">
            1 day
          </option>
          <option value="3">
            3 days
          </option>
          <option value="7">
            7 days
          </option>
          <option value="14">
            14 days
          </option>
          <option value="30">
            30 days
          </option>
        </select>
        <span class="form-text">Changes in sweet communities are made through voting proposals, which run for
          this many days. If a proposal fails to get enough votes during this period, it will be deleted.</span>
      </div>
      <div class="form-group">
        <label>Community image (optional but strongly recommended!)</label>
        <div
          id="image-preview"
          style="background-position: center; background-size: cover;"
          :style="{backgroundImage: 'url('+imagePreview+')'}"
        >
          <label for="image-upload" id="image-label">Choose image</label>
          <input @change="imageSelected" type="file" name="imageUpload" id="image-upload" accept="image/*">
        </div>
      </div>
      <button id="createCommunity" type="submit" class="button">
        Create
      </button>
    </form>
    <div style="display: none;" ref="modal">
      {{ warning }}
    </div>
  </div>
</template>

<script>
export default {
  data () {
    return {
      imagePreview: '/images/communities/cake.svg',
      name: '',
      warning: ''
    }
  },
  mounted () {
    const descField = this.$refs.communityDescriptionHTML
    const rulesField = this.$refs.communityRulesHTML
    attachQuill(descField, 'Write something. Highlight to format', true)
    attachQuill(rulesField, 'Write something. Highlight to format', true)
  },
  methods: {
    imageSelected (e) {
      if (e.target.files[0].size > 3145728) {
        this.warning = 'Image too large! Max file size is 3MB'
        e.target.value = ''
      } else {
        this.imagePreview = URL.createObjectURL(e.target.files[0])
      }
    },
    formSubmitted (e) {
      const fd = new FormData(e.target)

      fd.append('communityRules', this.rulesHTML())
      fd.append('communityDescription', this.descHTML())

      console.log('creating new community with values:')
      for (var pair of fd.entries()) {
        console.log(pair[0] + ', ' + pair[1])
      }

      $.ajax({
        url: '/api/community/create',
        data: fd,
        cache: false,
        processData: false,
        contentType: false,
        dataType: 'json',
        type: 'POST',
        success: (result) => {
          if (result.succeeded) {
            window.location.href = result.resultLocatedAt
          } else {
            this.warning = result.errorMessage
          }
        }
      })
    },
    descHTML () {
      return this.$refs.communityDescriptionHTML.querySelector('.ql-editor').innerHTML
    },
    rulesHTML () {
      return this.$refs.communityRulesHTML.querySelector('.ql-editor').innerHTML
    }
  },
  computed: {
    slug () {
      const a = 'àáäâãåăæçèéëêǵḧìíïîḿńǹñòóöôœṕŕßśșțùúüûǘẃẍÿź·/_,:;'
      const b = 'aaaaaaaaceeeeghiiiimnnnoooooprssstuuuuuwxyz------'
      const p = new RegExp(a.split('').join('|'), 'g')

      return this.name.toLowerCase()
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
        .replace(/&/g, '-and-') // Replace & with 'and'
        .replace(/[^\w\-]+/g, '') // Remove all non-word characters
        .replace(/\-\-+/g, '-') // Replace multiple - with single -
        .replace(/^-+/, '') // Trim - from start of text
        .replace(/-+$/, '') // Trim - from end of text
    }
  },
  watch: {
    warning (newWarning) {
      bootbox.alert(newWarning)
    }
  }
}
</script>
