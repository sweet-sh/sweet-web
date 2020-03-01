import TheCommunitiesPage from '../components/TheCommunitiesPage.vue'
import communitiesList from '../components/CommunitiesPageComponents/communitiesList.vue'
import { mount } from '@vue/test-utils'
import $ from 'jquery'
global.$ = global.jQuery = $
global.attachQuill = jest.fn()

describe('TheCommunitiesPage', () => {
    const initialJoinedCommunities = [{_id: 1}]
    const mountOptions = { propsData: { initialJoinedCommunities } }

    let wrapper = undefined
    beforeEach(() => {
        wrapper = mount(TheCommunitiesPage, mountOptions)
    })

    test('receives joinedCommunities from prop', () => {
        expect(wrapper.vm.joinedCommunities).toBe(initialJoinedCommunities)
    })
    
    test('tabs are switched to correctly', () => {
        wrapper.vm.switchToNewCommTab()
        expect(wrapper.vm.newCommTabOpen).toBe(true)
        expect(wrapper.vm.directoryTabOpen).toBe(false)
        expect(wrapper.vm.joinedTabOpen).toBe(false)

        wrapper.vm.switchToJoinedTab()
        expect(wrapper.vm.newCommTabOpen).toBe(false)
        expect(wrapper.vm.directoryTabOpen).toBe(false)
        expect(wrapper.vm.joinedTabOpen).toBe(true)

        wrapper.vm.switchToDirectoryTab()
        expect(wrapper.vm.newCommTabOpen).toBe(false)
        expect(wrapper.vm.directoryTabOpen).toBe(true)
        expect(wrapper.vm.joinedTabOpen).toBe(false)
    })

    test('communitiesList is rendered correctly', async () => {
        const fullJoinedCommunities = [
            {_id: 1, membersCount: 1, imageEnabled: false, descriptionParsed: '<p>hi</p>'},
            {_id: 2, membersCount: 2, imageEnabled: true, image: '/image.jpg', descriptionParsed: '<p>hello</p>'}]
        wrapper = mount(TheCommunitiesPage, {propsData: {initialJoinedCommunities: fullJoinedCommunities}})
        await wrapper.vm.$nextTick()
        expect(wrapper.find(communitiesList).exists()).toBe(true)
        expect(wrapper.html().indexOf('<p>hi</p>')).not.toBe(-1)
        expect(wrapper.html().indexOf('<p>hello</p>')).not.toBe(-1)
        expect(wrapper.html().indexOf('/image.jpg')).not.toBe(-1)
    })
})
