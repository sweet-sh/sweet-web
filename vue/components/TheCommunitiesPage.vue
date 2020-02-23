<template>
  <div id="homeBody" class="row justify-content-center">
    <div class="col-lg-8">
      <h3 class="page-header mx-2">
        Communities
      </h3>
      <ul id="communitiesTabs" class="nav nav-tabs" role="tablist">
        <li class="nav-item">
          <a
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
          v-show="joinedTabOpen"
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
          v-show="newCommTabOpen"
          id="newCommunity"
          class="tab-pane fade show active"
          role="tabpanel"
          aria-labelledby="newCommunityTab"
        >
          <newCommunityForm />
        </div>
        <div
          v-show="directoryTabOpen"
          id="directory"
          class="tab-pane fade show active"
          role="tabpanel"
          aria-labelledby="directoryTab"
        >
          <div v-if="firstPageFetched" id="directoryResults" class="compact-container">
            <communitiesList :list="results" />
          </div>
          <loadingSpinner
            v-if="loading || allResultsLoaded"
            :loading="loading"
            :message="loading ? '' : (firstPageFetched ? 'No more communities.' : 'No communities found, sorry.')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import communitiesList from './CommunitiesPageComponents/communitiesList.vue'
import newCommunityForm from './CommunitiesPageComponents/newCommunityForm.vue'
import infiniteLoader from './SharedSubComponents/infiniteLoaderMixin'
import loadingSpinner from './SharedSubComponents/loadingSpinner.vue'
import initialPageState from '../initialPageState'
export default {
  components: { communitiesList, loadingSpinner, newCommunityForm },
  mixins: [infiniteLoader],
  data () {
    return {
      joinedCommunities: initialPageState.joinedCommunities,
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
      this.pauseLoading()
      this.currentTab = 0
    },
    switchToNewCommTab () {
      this.pauseLoading()
      this.currentTab = 1
    },
    switchToDirectoryTab () {
      this.currentTab = 2
      this.startLoading('/api/community/getall/json/', true)
    }
  }
}
</script>
