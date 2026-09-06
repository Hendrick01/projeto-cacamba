"""Valida pesos, pose neutra e alcance da flexão dos GLBs preparados.
Uso: python scripts/verifica_rig.py --originais pasta-opcional
"""
import argparse,json
from glb_utils import *
from scipy.spatial.transform import Rotation

def posed(g,amount=0):
 j=g.j;s=j['skins'][0];p=j['meshes'][0]['primitives'][0]
 P=g.read(p['attributes']['POSITION']);J=g.read(p['attributes']['JOINTS_0']);W=g.read(p['attributes']['WEIGHTS_0']);B=g.read(s['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
 parents={c:i for i,n in enumerate(j['nodes']) for c in n.get('children',[])};cache={}
 def world(i):
  if i in cache:return cache[i]
  n=j['nodes'][i];m=np.eye(4);r=Rotation.from_quat(n.get('rotation',[0,0,0,1]));ex=n.get('extras',{})
  if ex.get('dedo'):r=r*Rotation.from_rotvec(np.array(ex['eixoFlexao'])*ex['anguloFlexao']*amount)
  m[:3,:3]=r.as_matrix()@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);cache[i]=world(parents[i])@m if i in parents else m;return cache[i]
 matrices=np.array([world(i) for i in s['joints']])@B;points=np.c_[P,np.ones(len(P))];out=np.zeros((len(P),4))
 for k in range(4):out+=np.einsum('nij,nj->ni',matrices[J[:,k]],points)*W[:,k,None]
 return out[:,:3]

def validate(originals=None):
 reports=[]
 for path in sorted(Path('public/models').glob('*.glb')):
  if path.name.startswith('_'):continue
  g=GLB(path);s=g.j['skins'][0];p=g.j['meshes'][0]['primitives'][0];W=g.read(p['attributes']['WEIGHTS_0']);J=g.read(p['attributes']['JOINTS_0']);P=g.read(p['attributes']['POSITION']);F=g.read(p['indices']).ravel().reshape(-1,3)
  assert len(s['joints'])==54 and len(set(s['joints']))==54
  assert np.all(np.isfinite(W)) and W.min()>=0 and np.max(abs(W.sum(1)-1))<1e-5
  assert J.max()<54 and F.max()<len(P)
  newbones={i for i in range(24,54) if np.any((J==i)&(W>0))};assert len(newbones)==30,(path,newbones)
  neutral=posed(g);closed=posed(g,.6);full=posed(g,1);assert np.isfinite(full).all()
  change=np.linalg.norm(neutral-closed,axis=1);assert change.max()<.17
  row={'modelo':path.stem,'triangulos':len(F),'ossos':len(s['joints']),'ossosDedosComPeso':len(newbones),'flexaoMaxCm':round(float(change.max()*100),3),'bytes':path.stat().st_size}
  if originals:
   old=GLB(Path(originals)/path.name);op=old.j['meshes'][0]['primitives'][0];assert np.array_equal(P,old.read(op['attributes']['POSITION']));assert np.array_equal(F.ravel(),old.read(op['indices']).ravel())
   before=posed(old);error=np.max(np.linalg.norm(before-neutral,axis=1));row['erroPoseNeutraMm']=round(float(error*1000),6)
   assert error<.0001,(path,error)
  reports.append(row)
 return reports
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--originais');args=parser.parse_args();print(json.dumps(validate(args.originais),ensure_ascii=False,indent=2))
