import Vue from 'vue'
import AudienceManager from './components/AudienceManager.vue'

new Vue({
  el: '#audience-manager-app',
  template: `<audience-manager v-if="canMount" />`,
  components: { AudienceManager },
  data() {
    return {
      canMount: false
    }
  },
  beforeMount() {
    if (localStorage.getItem('JWT')) {
      this.canMount = true;
    }
  }
})
