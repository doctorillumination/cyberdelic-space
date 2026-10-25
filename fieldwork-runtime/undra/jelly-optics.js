// A bounded dielectric path through the actual deformed jelly skin.
export const JELLY_IOR=1.36;
export const jellyOpticsGLSL=`
const float JELLY_IOR=${JELLY_IOR};
float jellyWeight(int id){float milky=1.0-uObjectClarity[id];return .96*(1.0-milky*milky);}
vec3 jellyExtinction(int id,vec3 pigment){
  vec3 chroma=clamp(pigment/max(max(pigment.r,pigment.g),pigment.b),.12,1.0);
  float dye=uObjectFinish[id]<.5?1.2:uObjectFinish[id]<1.5?1.9:.65;
  float haze=mix(2.1,.16,uObjectClarity[id])*(uObjectFinish[id]>1.5?1.4:1.0);
  return -log(chroma)*dye+vec3(haze+.10);
}
bool jellyThrough(int id,vec3 p,vec3 incoming,vec3 normal,out vec3 origin,out vec3 direction,out float thickness,out float interfaceWeight){
  direction=refract(incoming,normal,1.0/JELLY_IOR);origin=p;thickness=0.0;interfaceWeight=0.0;
  if(dot(direction,direction)<.01)return false;
  interfaceWeight=1.0-fresnel(clamp(dot(-incoming,normal),0.0,1.0),1.0,JELLY_IOR);
  const float epsilon=.001;
  origin=p+direction*epsilon;thickness=epsilon;
  for(int bounce=0;bounce<3;bounce++){
    vec3 outward;float maximum=uObjectBounds[id].x*4.0+.02;
    float distance=intersectSoftMesh(id,origin,direction,maximum,outward);
    if(distance>=maximum-.00001)return false;
    vec3 exitPoint=origin+direction*distance;thickness+=distance;
    if(dot(outward,direction)<0.0)outward=-outward;
    float F=fresnel(clamp(dot(direction,outward),0.0,1.0),JELLY_IOR,1.0);
    vec3 transmitted=refract(direction,-outward,JELLY_IOR);
    if(dot(transmitted,transmitted)>.01){
      direction=normalize(transmitted);origin=exitPoint+direction*epsilon;
      // Floor-bound jelly can exit exactly at the substrate. Keep the next floor hit valid.
      origin.z=max(origin.z,.0003);interfaceWeight*=1.0-F;return true;
    }
    direction=reflect(direction,outward);origin=exitPoint+direction*epsilon;thickness+=epsilon;
  }
  // A trapped grazing path uses the milky surface fallback, never an empty black return.
  return false;
}
`;
