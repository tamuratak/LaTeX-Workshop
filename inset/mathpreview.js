const vscode = acquireVsCodeApi();
window.addEventListener('message', event => {
  const message = event.data; // The JSON data our extension sent
  switch (message.type) {
    case "mathImage":
      const img = document.getElementById('math');
      img.onload = () => {
        if (img.height > window.innerHeight) {
          vscode.postMessage({
            type: "sizeInfo",
            window: { width: window.innerWidth, height: window.innerHeight },
            img: { width: img.width, height: img.height }
          });
        } else {
          const mathBlock = document.getElementById('mathBlock');
          mathBlock.style.height = window.innerHeight + 'px';
          img.style.top = (window.innerHeight - img.height) / 2 + 'px';
          if (img.width >= window.innerWidth) {
            img.style.left = '0px';
          } else {
            const leftRatio = message.leftRatio;
            img.style.left = (window.innerWidth - img.width) * leftRatio + 'px';
            window.addEventListener('resize', () => {
              img.style.left = (window.innerWidth - img.width) * leftRatio + 'px';
            })
          }
          img.style.visibility = 'visible';
        }
      }
      img.src = message.src;
      break;
    default:
      break;
  }
});