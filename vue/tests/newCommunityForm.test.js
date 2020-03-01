import newCommunityForm from '../components/CommunitiesPageComponents/newCommunityForm.vue'
import { mount } from '@vue/test-utils'
import $ from 'jquery'
global.$ = global.jQuery = $
global.attachQuill = jest.fn((e) => {
    const edit = document.createElement('div')
    edit.setAttribute('class', 'ql-editor')
    e.appendChild(edit)
})
delete global.window.location
global.window = Object.create(window)
global.window.location = { href: '/communities' }
const alert = jest.fn()
global.bootbox = { alert }
global.URL.createObjectURL = jest.fn()

describe('newCommunityForm', () => {
    let wrapper = undefined
    beforeEach(() => {
        global.$.ajax = jest.fn()
        wrapper = mount(newCommunityForm)
        wrapper.setData({ name: 'new community' })
    })

    test('attaches the quill text editor to rules and description fields', () => {
        expect(global.attachQuill).toBeCalledTimes(2)
    })

    test('returns the html contents of the quill editor fields correctly', async () => {
        await wrapper.vm.$nextTick()
        wrapper.vm.$refs.communityDescriptionHTML.querySelector('.ql-editor').innerHTML = '<p>hi</p>'
        wrapper.vm.$refs.communityRulesHTML.querySelector('.ql-editor').innerHTML = '<p>hello</p>'
        expect(wrapper.vm.descHTML()).toBe('<p>hi</p>')
        expect(wrapper.vm.rulesHTML()).toBe('<p>hello</p>')
    })

    test('creates a community slug with the right constraints', () => {
        wrapper.setData({name: '  àáäâãåăæçèéëêǵḧìÈÈÉÉÀÀÁÁíïî ASDSWSḿńǹñòóöôœṕŕß     śșțùúüûǘẃẍÿź·/_,:;  '})
        expect(wrapper.vm.slug).toBe(wrapper.vm.slug.toLowerCase())
        expect(wrapper.vm.slug.includes(' ')).toBe(false)
        expect(wrapper.vm.slug.includes('--')).toBe(false)
        expect(wrapper.vm.slug.substring(0,1)).toBe('a')
        expect(wrapper.vm.slug.substring(wrapper.vm.slug.length-1)).toBe('z')
    })

    test('calls bootbox.alert() with a new warning', async () => {
        wrapper.setData({warning: 'something terrible has happened'})
        await wrapper.vm.$nextTick()
        expect(alert).toBeCalledWith('something terrible has happened')
    })

    test('submits form with ajax function with correct settings', () => {
        wrapper.find('form').trigger('submit')
        expect(global.$.ajax).toBeCalled()
        const ajaxSettings = global.$.ajax.mock.calls[0][0]
        expect(ajaxSettings.url).toBe('/api/community/create')
        expect(ajaxSettings.dataType).toBe('json')
        expect(ajaxSettings.type).toBe('POST')
    })

    test('responds to form submission success and failure appropriately', () => {
        global.$.ajax = jest.fn((settings) => {settings.success({succeeded: true, resultLocatedAt: '/newCommURL'})})
        wrapper.find('form').trigger('submit')
        expect(window.location.href).toBe('/newCommURL')

        global.$.ajax = jest.fn((settings) => {settings.success({succeeded: false, errorMessage: 'problem happened'})})
        wrapper.find('form').trigger('submit')
        expect(wrapper.vm.warning).toBe('problem happened')
    })

    test('submits formData with correct properties', () => {
        wrapper.find('form').trigger('submit')
        const fd = global.$.ajax.mock.calls[0][0].data
        const requiredKeys = [
            'communityName', 'communityVisibility', 'communityJoinType', 'communityVoteLength', 'imageUpload',
            'communityRules', 'communityDescription'
        ]
        for (const key of requiredKeys){
            expect(fd.has(key)).toBe(true)
        }
    })

    test('validates image size properly', () => {
        wrapper.setData({ warning: '' })
        const tooLargeInputEvent = { target: { value: 'image data', files: [{ size: 3145729 }] } }
        wrapper.vm.imageSelected(tooLargeInputEvent)
        expect(wrapper.vm.warning).not.toBe('')

        const okayInputEvent = { target: { value: 'image data', files: [{ size: 3145728 }] } }
        wrapper.vm.imageSelected(okayInputEvent)
        expect(global.URL.createObjectURL).toBeCalled()
    })

})