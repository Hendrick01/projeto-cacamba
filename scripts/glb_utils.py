"""Leitura/escrita de GLB, inclusive atributos intercalados. Requer NumPy."""
import json, struct
from pathlib import Path
import numpy as np
TYPES={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
SIZES={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
class GLB:
 def __init__(self,path):
  b=Path(path).read_bytes(); magic,version,total=struct.unpack_from('<III',b)
  if magic!=0x46546c67 or version!=2 or total!=len(b):raise ValueError('GLB inválido')
  l=struct.unpack_from('<I',b,12)[0];self.j=json.loads(b[20:20+l]);self.bin=bytearray(b[28+l:])
 def read(self,i):
  a=self.j['accessors'][i];v=self.j['bufferViews'][a['bufferView']];dt=np.dtype(TYPES[a['componentType']]);n=SIZES[a['type']]
  return np.ndarray((a['count'],n),dt,self.bin,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*n),dt.itemsize)).copy()
 def overwrite(self,i,values):
  a=self.j['accessors'][i];v=self.j['bufferViews'][a['bufferView']];dt=np.dtype(TYPES[a['componentType']]);n=SIZES[a['type']]
  arr=np.ndarray((a['count'],n),dt,self.bin,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*n),dt.itemsize));arr[:]=values
  if 'min' in a:a['min']=arr.min(0).tolist()
  if 'max' in a:a['max']=arr.max(0).tolist()
 def add(self,arr,typ,component=5126):
  arr=np.asarray(arr,dtype=TYPES[component]).reshape(-1,SIZES[typ]);self.bin.extend(b'\0'*((-len(self.bin))%4));off=len(self.bin);self.bin.extend(arr.tobytes());self.j['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':arr.nbytes})
  a={'bufferView':len(self.j['bufferViews'])-1,'componentType':component,'count':len(arr),'type':typ}
  if typ!='MAT4':a.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
  self.j['accessors'].append(a);return len(self.j['accessors'])-1
 def write(self,path):
  self.j['buffers'][0]['byteLength']=len(self.bin);b=json.dumps(self.j,separators=(',',':')).encode();b+=b' '*((-len(b))%4);data=bytes(self.bin);data+=b'\0'*((-len(data))%4)
  Path(path).write_bytes(struct.pack('<III',0x46546c67,2,28+len(b)+len(data))+struct.pack('<II',len(b),0x4e4f534a)+b+struct.pack('<II',len(data),0x004e4942)+data)
