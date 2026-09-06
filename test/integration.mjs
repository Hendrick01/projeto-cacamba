// Executa integrações existentes contra um servidor temporário, sem serviço externo.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PUBLIC_URL:'',TRUST_PROXY:'0'},stdio:['ignore','pipe','pipe']});
server.stderr.on('data',d=>process.stderr.write(d));
try {
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('Caçamba no ar'))resolve()});server.on('exit',()=>reject(new Error('Servidor não iniciou')))});
 for(const file of process.argv.slice(2).length ? process.argv.slice(2) : ['e2e','sair','defesas','voz','convite','sobra']) {
  const child=spawn(process.execPath,[`test/${file}.mjs`,String(port)],{stdio:'inherit'});const [code]=await once(child,'exit');if(code!==0)throw new Error(`${file}: saída ${code}`);
 }
} catch(error) {console.error(error.message);process.exitCode=1;} finally {
 if(server.exitCode===null&&server.signalCode===null){const stop=once(server,'exit');server.kill('SIGTERM');await stop;}
}
