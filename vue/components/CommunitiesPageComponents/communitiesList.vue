<template>
    <div>
        <div :key="comm._id" v-for="comm in list">
            {{comm}}
        </div>
    </div>
</template>

<script>
export default {
    props: {
        list: {
            type: Array,
            required: true
        }
    }
}
</script>