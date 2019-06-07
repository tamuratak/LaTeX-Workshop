const vscode = acquireVsCodeApi();
window.addEventListener('message', event => {
  const message = event.data; // The JSON data our extension sent
  switch (message.type) {
    case "mathImage":
      const img = document.getElementById('math');
      img.onload = () => {
        vscode.postMessage({
            type: "sizeInfo",
            window: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            img: {
                width: img.width,
                height: img.height
            }
        })
      }
      img.src = message.src;
      break;
    default:
      break;
  }
});