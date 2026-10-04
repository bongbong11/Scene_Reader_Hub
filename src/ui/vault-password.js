export function createVaultPasswordPrompt({document,verify,onUnlocked,onWrong}) {
    let dialog;
    function show() {
        if (dialog?.open) { dialog.querySelector('input').focus(); return; }
        dialog=document.createElement('dialog'); dialog.className='sr-vault-password';
        const form=document.createElement('form');
        const label=document.createElement('label'); label.textContent='비밀번호를 입력하세요';
        const input=document.createElement('input');input.type='password';input.autocomplete='off';input.maxLength=128;input.required=true;
        label.append(input);
        const actions=document.createElement('div');
        const cancel=document.createElement('button');cancel.type='button';cancel.textContent='취소';
        const submit=document.createElement('button');submit.type='submit';submit.textContent='열기';
        actions.append(cancel,submit);form.append(label,actions);dialog.append(form);
        const close=()=>{input.value='';dialog.close();dialog.remove();dialog=null;};
        cancel.addEventListener('click',close);
        dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
        form.addEventListener('submit',event=>{
            event.preventDefault();const accepted=verify(input.value);close();
            if(accepted)onUnlocked();else onWrong();
        });
        document.body.append(dialog);dialog.showModal();input.focus();
    }
    return {show};
}
