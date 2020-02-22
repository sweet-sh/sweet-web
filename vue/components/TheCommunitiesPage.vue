<template>
  <div id="homeBody" class="row justify-content-center">
    <div class="col-lg-8">
      <h3 class="page-header mx-2">
        Communities
      </h3>
      <ul id="communitiesTabs" class="nav nav-tabs" role="tablist">
        <li class="nav-item">
          <a
            id="communitiesListTab"
            class="nav-link"
            :class="joinedTabOpen ? 'active' : ''"
            href
            role="tab"
            aria-controls="tabs-home"
            aria-selected="true"
            @click.prevent="switchToJoinedTab"
          >
            Joined
          </a>
        </li>
        <li class="nav-item">
          <a
            id="newCommunityTab"
            class="nav-link"
            :class="newCommTabOpen ? 'active' : ''"
            href
            role="tab"
            aria-controls="newCommunityTab"
            aria-selected="false"
            @click.prevent="switchToNewCommTab"
          >
            Create new
          </a>
        </li>
        <li class="nav-item">
          <a
            id="directoryTab"
            class="nav-link"
            :class="directoryTabOpen ? 'active' : ''"
            href
            role="tab"
            aria-controls="directoryTab"
            aria-selected="false"
            @click.prevent="switchToDirectoryTab"
          >
            Show all
          </a>
        </li>
      </ul>

      <div id="communitiesTabContent" class="tab-content">
        <div
          v-if="joinedTabOpen"
          id="communitiesList"
          class="tab-pane fade show active"
          role="tabpanel"
          aria-labelledby="communitiesListTab"
        >
          <div id="resultsContainer" class="compact-container">
            <communitiesList :list="joinedCommunities" />
          </div>
        </div>
        <div
          v-if="newCommTabOpen"
          id="newCommunity"
          class="tab-pane fade show active"
          role="tabpanel"
          aria-labelledby="newCommunityTab"
        >
          NEW COMMUNITY FORM...
        </div>
        <div
          v-if="directoryTabOpen"
          id="directory"
          class="tab-pane fade show active"
          role="tabpanel"
          aria-labelledby="directoryTab"
        >
          <div id="directoryResults" class="compact-container">
            <communitiesList :list="[]" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import communitiesList from './CommunitiesPageComponents/communitiesList.vue'
import infiniteLoader from './SharedSubComponents/infiniteLoaderMixin'
export default {
  components: { communitiesList },
  mixins: [infiniteLoader],
  data () {
    return {
      joinedCommunities: JSON.parse(
        document.getElementById('joinedCommunities').innerHTML
      ),
      currentTab: 0
    }
  },
  computed: {
    joinedTabOpen () {
      return this.currentTab === 0
    },
    newCommTabOpen () {
      return this.currentTab === 1
    },
    directoryTabOpen () {
      return this.currentTab === 2
    }
  },
  methods: {
    switchToJoinedTab () {
      this.currentTab = 0
    },
    switchToNewCommTab () {
      this.currentTab = 1
    },
    switchToDirectoryTab () {
      this.currentTab = 2
    }
  }
}
</script>
