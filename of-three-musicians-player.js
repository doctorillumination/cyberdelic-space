/* Only this artwork pauses its generated performance while About is open. */
(function(){
  var frame=document.querySelector('.fieldwork-player iframe'),about=document.querySelector('.fieldwork-about'),open=document.querySelector('[data-open-about]');
  function notify(){if(frame.contentWindow)frame.contentWindow.postMessage({type:'of-three-musicians:about',open:about.open},location.origin);}
  open.addEventListener('click',notify);about.addEventListener('close',notify);frame.addEventListener('load',function(){if(about.open)notify();});
})();
