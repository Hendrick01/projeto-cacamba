"""Inspeção em CPU com textura original e z-buffer; não mede FPS/WebGL."""
import json,sys,io,os
import numpy as np
from PIL import Image
from glb_utils import GLB
from numba import njit
@njit(cache=True)
def rast(img,depth,P,F,UV,tex,color,bright,hand):
 h,w=depth.shape
 for f in F:
  a,b,c=P[f[0]],P[f[1]],P[f[2]]
  if min(a[2],b[2],c[2])<=0:continue
  x0=max(0,int(min(a[0],b[0],c[0])));x1=min(w-1,int(max(a[0],b[0],c[0]))+1)
  y0=max(0,int(min(a[1],b[1],c[1])));y1=min(h-1,int(max(a[1],b[1],c[1]))+1)
  den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
  if abs(den)<.00001:continue
  for y in range(y0,y1):
   for x in range(x0,x1):
    u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
    v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;t=1-u-v
    if min(u,v,t)<0:continue
    z=u*a[2]+v*b[2]+t*c[2]
    if z>=depth[y,x]:continue
    depth[y,x]=z
    if len(tex)>1:
     uu=u*UV[f[0],0]+v*UV[f[1],0]+t*UV[f[2],0];vv=u*UV[f[0],1]+v*UV[f[1],1]+t*UV[f[2],1]
     rgb=tex[min(tex.shape[0]-1,max(0,int((vv%1)*tex.shape[0]))),min(tex.shape[1]-1,max(0,int((uu%1)*tex.shape[1])))]/255.
    else:rgb=color
    # iluminação direcional aproximada (normais de face no espaço câmera)
    light=u*bright[f[0]]+v*bright[f[1]]+t*bright[f[2]];img[y,x]=np.minimum(255,np.maximum(0,rgb*255*light))
slug=sys.argv[1];mode=sys.argv[2] if len(sys.argv)>2 else 'full';angle=float(sys.argv[3]) if len(sys.argv)>3 else .7
folder=os.environ.get('QA_DIR','/tmp');scene=json.load(open(folder+('/sala.json' if mode=='scene' else '/cacamba-pose.json')))
textures={}
def texture(slug):
 if slug not in textures:
  g=GLB('public/models/'+slug+'.glb');im=g.j['images'][0];bv=g.j['bufferViews'][im['bufferView']]
  textures[slug]=np.array(Image.open(io.BytesIO(g.bin[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB'))
 return textures[slug]
W,H=(1400,850) if mode=='scene' else (900,900)
img=np.full((H,W,3),[55,65,61],dtype=np.uint8);depth=np.full((H,W),1e9)
target=np.array([0,.95,-.3]) if mode=='scene' else np.array([0,.96,.33]) if mode=='hand' else np.array([0,.72,0]);zoom=1600 if mode=='hand' else 480
eye=np.array([0,1.5,2.65]) if mode=='scene' else target+np.array([np.sin(angle),.15,np.cos(angle)])*3
forward=target-eye;forward/=np.linalg.norm(forward);right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
for mesh in scene:
 P=np.array(mesh['pos']);F=np.array(mesh['indices']).reshape(-1,3);D=P-eye
 if mode=='scene':
  dep=D@forward;zs=np.maximum(.001,dep);f=H/2/np.tan(np.radians(55)/2);proj=np.c_[D@right*f/zs+W/2,-D@up*f/zs+H/2,dep]
 else:proj=np.c_[(P-target)@right*zoom+W/2,-(P-target)@up*zoom+H/2,D@forward]
 faceN=np.cross(P[F[:,1]]-P[F[:,0]],P[F[:,2]]-P[F[:,0]]);norm=np.zeros_like(P)
 for k in range(3):np.add.at(norm,F[:,k],faceN)
 norm/=np.maximum(1e-10,np.linalg.norm(norm,axis=1))[:,None];light=np.array([-.45,.75,.65]);light/=np.linalg.norm(light);bright=.47+.53*np.maximum(0,norm@light)
 UV=np.array(mesh['uv']).reshape(-1,2) if mesh['uv'] else np.zeros((len(P),2));UV*=np.array(mesh.get('repeat',[1,1]))
 tex=texture(mesh.get('slug') or slug) if mesh['skin'] else np.array(Image.open(mesh['texture']).convert('RGB')) if mesh.get('texture') else np.zeros((1,1,3),dtype=np.uint8)
 rast(img,depth,proj,F,UV,tex,np.array(mesh['color'],dtype=np.float64),bright,True)
Image.fromarray(img).save(folder+'/cacamba-'+slug+'-'+mode+'.png')
