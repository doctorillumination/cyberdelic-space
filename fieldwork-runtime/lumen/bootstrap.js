import('./app.js').catch(error=>{
 console.error(error);
 document.getElementById('loading').hidden=true;
 const message=document.getElementById('error');
 message.textContent='The artwork could not start: '+error.message;
 message.hidden=false;document.body.dataset.renderer='failed';
});
