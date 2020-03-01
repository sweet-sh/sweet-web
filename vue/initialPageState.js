const stateElement = document.getElementById('initialPageState')
let state = {}
if(stateElement && stateElement.innerHTML){
    try{
        state = JSON.parse(stateElement.innerHTML)
    }catch{
        console.error("#initialPageState contents not valid JSON! initial state will be empty")
    }
}
export default state
