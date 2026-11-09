/* The gallery can open the introduction without adding controls over the pond. */
(function(){
 var player=document.querySelector('[data-fieldwork="paper-water"]'),frame=player.querySelector('iframe'),about=player.querySelector('.fieldwork-about');
 function open(){if(!about.open)about.showModal();}
 function shortcut(event){if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,select,textarea,[contenteditable=true]'))return;if(event.key.toLowerCase()==='i'){event.preventDefault();open();}}
 function hash(){if(location.hash==='#about')open();}
 document.addEventListener('keydown',shortcut);window.addEventListener('hashchange',hash);
 frame.addEventListener('load',function(){if(frame.contentDocument)frame.contentDocument.addEventListener('keydown',shortcut);});
 about.addEventListener('close',function(){if(location.hash==='#about')history.replaceState(null,'',location.pathname+location.search);frame.focus();});hash();
})();
