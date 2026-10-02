import {randomBytes,createCipheriv,createDecipheriv,publicEncrypt,privateDecrypt,constants,createHash} from 'node:crypto';
const magic=Buffer.from('FCBACKUP2\n');
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function encryptBackup(bytes,publicKey){
 const key=randomBytes(32),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 const wrapped=publicEncrypt({key:publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key);
 const header=Buffer.from(JSON.stringify({version:2,key:wrapped.toString('base64'),nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),sha256:hash(bytes)})+'\n');
 key.fill(0);return Buffer.concat([magic,header,ciphertext]);
}
export function decryptBackup(stored,privateKey){
 if(!stored.subarray(0,magic.length).equals(magic))throw Error('Unsupported backup format');
 const end=stored.indexOf(10,magic.length);if(end<0||end>8192)throw Error('Invalid backup header');
 const header=JSON.parse(stored.subarray(magic.length,end)),key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(header.key,'base64'));
 try{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(header.nonce,'base64'));decipher.setAuthTag(Buffer.from(header.tag,'base64'));const bytes=Buffer.concat([decipher.update(stored.subarray(end+1)),decipher.final()]);if(hash(bytes)!==header.sha256)throw Error('Backup integrity mismatch');return bytes;}finally{key.fill(0);}
}
