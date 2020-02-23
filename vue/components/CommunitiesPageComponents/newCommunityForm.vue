<template>
  <div>
    <p>
      Fill out this form to create a new community. Although you are the community's creator, on sweet all
      members of a community are equal, and there are no administrators or moderators. This means that you
      should make the choices below carefully, because after the community is created, you will only be able
      to change them by a majority vote!
    </p>

    <form
      action="/api/community/create"
      method="post"
      enctype="multipart/form-data"
      ref="newCommunityForm"
    >
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
      <button @click="submitButtonPressed" id="createCommunity" type="submit" class="button">
        Create
      </button>
    </form>
  </div>
</template>

<script>
export default {
  data () {
    return {
      imagePreview: '/images/communities/cake.svg',
      name: ''
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
      this.imagePreview = URL.createObjectURL(e.target.files[0])
    },
    submitButtonPressed (e) {
      const newCommForm = this.$refs.newCommunityForm
      const descInput = document.createElement('input')
      descInput.setAttribute('type', 'hidden')
      descInput.setAttribute('name', 'communityDescription')
      descInput.setAttribute('value', this.descHTML())
      newCommForm.appendChild(descInput)

      const rulesInput = document.createElement('input')
      rulesInput.setAttribute('type', 'hidden')
      rulesInput.setAttribute('name', 'communityRules')
      rulesInput.setAttribute('value', this.rulesHTML())
      newCommForm.appendChild(rulesInput)

      const fd = new FormData(newCommForm)
      console.log('creating new community with values:')
      for (var pair of fd.entries()) {
        console.log(pair[0] + ', ' + pair[1])
      }

      return true
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
  }
}
</script>
