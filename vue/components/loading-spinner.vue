<template>
    <div class="page-load-status">
        <div v-if="loading" class="loader-ellips infinite-scroll-request">
            <span class="loader-ellips__dot"></span>
            <span class="loader-ellips__dot"></span>
            <span class="loader-ellips__dot"></span>
            <span class="loader-ellips__dot"></span>
        </div>
        <p v-else>{{message}}</p>
    </div>
</template>

<script>
export default {
    props: ['loading', 'message']
}
</script>