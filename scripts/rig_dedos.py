"""Acrescenta 30 ossos e pesos aos GLBs do elenco, sem mudar a malha/texturas.
Uso: python scripts/rig_dedos.py entrada.glb saida.glb --slug matheus
Requer: numpy, scipy. Marcos conferidos na projeção das mãos; não é um rigger
universal. A pose neutra é preservada. Flexão moderada: revisar no provador.
"""
import argparse
from glb_utils import *
from scipy.spatial.transform import Rotation
TIPS={
 'matheus':[[[-4,9],[-3,14],[0,18],[3,18],[6,12]],[[-5,8],[-4.3,14],[-1.5,17.7],[1.2,18],[4,14]]],
 'dri':[[[5.5,12],[2.5,14],[0,16.5],[-2.5,17.5],[-5,15.8]],[[-7,12],[-4,15],[-1,18],[2,17],[4.3,14]]],
 'junior':[[[-8,8],[-7,13],[-4,16],[-1.5,16],[2,13]],[[1,9],[-1.5,14.5],[-4,16],[-6.5,16],[-8,11]]],
 'gabizinsky':[[[3,8],[2.5,13.5],[0,17],[-3.5,17.5],[-5.7,13]],[[4.5,6],[4,13],[1.5,17],[-1,17.7],[-4.5,13]]],
 'esterex':[[[4.5,8],[4,13],[1.6,17],[-1,16.5],[-4,14]],[[-4.5,5],[-4.5,13.5],[-1.5,18],[1.8,16.5],[4.5,15]]],
 'lyly':[[[2.5,7],[3.5,13],[0,16.5],[-2.3,17],[-4.4,13]],[[5,7],[4,13.5],[1.7,16.5],[-1,16.5],[-3.5,13.5]]],
 'mafra-kitty':[[[-3.5,8],[-3.5,14],[-1,16.5],[2,16],[4,12.5]],[[4,8],[3.5,15],[1.5,18],[-1,16.5],[-4,14]]],
 'mufasa':[[[-5,9],[-4.5,15.5],[-2,19],[.5,19],[4,15]],[[5,7],[4,14],[2,17],[-.5,19],[-3,15]]],
}

def rig(src,dst,slug):
 g=GLB(src);j=g.j
 if j.get('extras',{}).get('rigDedos'):raise ValueError('Este arquivo já tem rig de dedos')
 s=j['skins'][0];names=[j['nodes'][i]['name'] for i in s['joints']];ibm=g.read(s['inverseBindMatrices']);extra_ibm=[]
 prim=j['meshes'][0]['primitives'][0];P=g.read(prim['attributes']['POSITION']);J=g.read(prim['attributes']['JOINTS_0']);W=g.read(prim['attributes']['WEIGHTS_0']);Jnew=J.copy();Wnew=W.copy()
 parents={c:i for i,n in enumerate(j['nodes']) for c in n.get('children',[])}
 def world(i):
  n=j['nodes'][i];m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return world(parents[i])@m if i in parents else m
 changed=0;checks=[];channels=[];samplers=[];time=g.add([[0],[.7],[1.4],[2.1]],'SCALAR')
 for si,side in enumerate(['Left','Right']):
  hand=names.index(side+'Hand');handnode=s['joints'][hand];weight=((J==hand)*W).sum(1);mask=weight>.4;T=ibm[hand].reshape(4,4).T;h=(np.c_[P,np.ones(len(P))]@T.T)[:,:3]
  xz=h[mask][:,[0,2]];_,_,vec=np.linalg.svd(xz-xz.mean(0));u=np.array([vec[0,0],0,vec[0,1]]);
  signZ = -1 if (si==0 and slug in ['dri','gabizinsky','esterex','lyly']) or (si==1 and slug in ['junior','mafra-kitty']) else 1
  if u[2]*signZ<0:u=-u
  normal=np.cross(u,[0,1,0]);normal/=np.linalg.norm(normal)
  # Flexão para a palma voltada para o corpo, no espaço da pose sentada.
  if (world(handnode)[:3,:3]@normal)[2]>0:normal=-normal
  axis=np.cross([0,1,0],normal);axis/=np.linalg.norm(axis)
  uv=np.c_[h@u,h[:,1]];depth=np.median(h[mask]@normal);L=np.percentile(h[mask,1],99);tips=np.array(TIPS[slug][si],float)
  centers=[];roots=[];bones=[]
  for f,(tx,ty) in enumerate(tips):
   base=np.array([tx*.58,ty*.40]) if f==0 else np.array([tx*.77,min(L*.50,ty*.62)])
   roots.append(base);centers.append([base+(np.array([tx,ty])-base)*a for a in [0,.45,.76]])
   parent=handnode;previous=np.zeros(3);ids=[]
   for seg,c in enumerate(centers[-1]):
    loc=u*c[0]+np.array([0,c[1],0])+normal*depth
    idx=len(j['nodes']);joint=len(s['joints']);ids.append(joint)
    amount=([12,18,12] if f==0 else [18,24,14])[seg]*np.pi/180
    node={'name':f'{side}Hand'+['Thumb','Index','Middle','Ring','Pinky'][f]+str(seg+1),'translation':(loc-previous).tolist(),'rotation':[0,0,0,1],
      'extras':{'dedo':True,'eixoFlexao':axis.tolist(),'anguloFlexao':amount,'segmento':seg}}
    j['nodes'].append(node);j['nodes'][parent].setdefault('children',[]).append(idx);s['joints'].append(idx)
    M=np.eye(4);M[:3,3]=-loc;inv=M@T;extra_ibm.append(inv.T.reshape(-1))
    # Na pose zero, a matriz do novo joint precisa coincidir com a da mão.
    forward=np.eye(4);forward[:3,3]=loc;checks.append(float(np.max(np.abs(forward@inv-T))))
    q=Rotation.from_rotvec(axis*amount*.6).as_quat().tolist();out=g.add([[0,0,0,1],q,q,[0,0,0,1]],'VEC4')
    samplers.append({'input':time,'output':out,'interpolation':'LINEAR'});channels.append({'sampler':len(samplers)-1,'target':{'node':idx,'path':'rotation'}})
    parent=idx;previous=loc
   bones.append(ids)
  # Distância a cada eixo do dedo; palma e punho mantêm os pesos originais.
  roots=np.array(roots);dists=[];fractions=[]
  for f in range(5):
   delta=tips[f]-roots[f];a=np.clip(((uv-roots[f])@delta)/(delta@delta),0,1);nearest=roots[f]+a[:,None]*delta
   dists.append(np.linalg.norm(uv-nearest,axis=1));fractions.append(a)
  chosen=np.argmin(np.array(dists),axis=0)
  for v in np.flatnonzero(mask):
   f=chosen[v];a=fractions[f][v];base=roots[f]
   blend=np.clip((uv[v,1]-base[1]+.8)/2.0,0,1);blend=blend*blend*(3-2*blend)
   if blend<=0:continue
   others=[(int(jo),float(we)) for jo,we in zip(J[v],W[v]) if jo!=hand and we>0]
   section=np.clip(a/.45,0,2);lo=min(1,int(section));mix=section-lo
   finger=[(hand,1-blend),(bones[f][lo],blend*(1-mix)),(bones[f][lo+1],blend*mix)]
   finger=sorted(finger,key=lambda item:item[1],reverse=True)[:4-len(others)]
   denom=sum(x[1] for x in finger)
   top=others+[(joint,factor/denom*float(weight[v])) for joint,factor in finger]
   Jnew[v]=0;Wnew[v]=0
   for k,(joint,we) in enumerate(top):Jnew[v,k]=joint;Wnew[v,k]=we
   changed+=1
 s['inverseBindMatrices']=g.add(np.vstack([ibm,extra_ibm]),'MAT4');g.overwrite(prim['attributes']['JOINTS_0'],Jnew);g.overwrite(prim['attributes']['WEIGHTS_0'],Wnew)
 assert np.max(abs(Wnew.sum(1)-1))<1e-5 and max(checks)<1e-5 and Jnew.max()<len(s['joints'])
 j.setdefault('animations',[]).append({'name':'dedosTeste','samplers':samplers,'channels':channels})
 j.setdefault('extras',{})['rigDedos']={'version':1,'method':'marcos por personagem + pesos locais suaves','vertices':changed,'bones':30,'neutralMatrixError':max(checks),'review':'Flexão moderada; validar no provador antes de publicar.'}
 g.write(dst);print(slug,':',len(s['joints']),'ossos,',changed,'vértices com flexão; erro matriz neutra',max(checks))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('src');p.add_argument('dst');p.add_argument('--slug',required=True,choices=TIPS);a=p.parse_args();rig(a.src,a.dst,a.slug)
