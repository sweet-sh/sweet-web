import searchPage from '../components/TheSearchPage'
import { shallowMount } from '@vue/test-utils'

describe('TheSearchPage', () => {
  const wrapper = shallowMount(searchPage)
  test('is a Vue instance', () => {
    expect(wrapper.isVueInstance()).toBeTruthy()
  })
})
