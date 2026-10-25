import {createShape} from './models.js';
self.onmessage=({data})=>{
 try{
  const model=createShape(data.id,data.seed);
  const buffers=['positions','radii','normals','facets','development'].map(key=>model[key].buffer);
  self.postMessage({request:data.request,id:data.id,model},buffers);
 }catch(error){self.postMessage({request:data.request,error:error.message});}
};
