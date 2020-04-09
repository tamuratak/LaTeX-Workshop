// when the iframe loads, or when the tab gets focus again later, move the
// the focus to the iframe so that keyboard navigation works in the pdf.
//
// Note: this works on first load, or when navigating between groups, but not when
//       navigating between tabs of the same group for some reason!
window.addEventListener('DOMContentLoaded ', () => {
    const iframe = document.getElementById('preview-panel');
    window.onfocus = iframe.onload = function() {
        setTimeout(function() { // doesn't work immediately
                   iframe.contentWindow.focus();
                }, 100);
            }
})

const vsStore = acquireVsCodeApi();
console.log(vsStore);
// vsStore.setState({path: '${pdfFile}'});
// To enable keyboard shortcuts of VS Code when the iframe is focused,
// we have to dispatch keyboard events in the parent window.
// See https://github.com/microsoft/vscode/issues/65452#issuecomment-586036474
window.addEventListener('message', (e) => {
    console.log('messssggg!!')
    if (e.origin !== `http://localhost:${extensionServerPort}`) {
        return;
    }
    switch (e.data.type) {
        case 'initialized': {
            const status = vsStore.getState();
            const iframe = document.getElementById('preview-panel');
            status.type = 'restore_status';
            iframe.contentWindow.postMessage(status, '*');
            break;
        }
        case 'keyboard_event': {
            window.dispatchEvent(new KeyboardEvent('keydown', e.data.event));
            break;
        }
        case 'status': {
            vsStore.setState(e.data);
            break;
        }
        default:
            break;
    }
});
