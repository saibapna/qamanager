import argon2 from 'argon2';
import {randomBytes,pbkdf2Sync,timingSafeEqual} from 'node:crypto';

/** Compatible across Express and Cloudflare Workers. Older Argon2 hashes remain verifiable in Express. */
export const hashPassword=async plain=>{
  if(typeof plain!=='string'||plain.length<16||plain.length>128)throw new Error('Password harus 16–128 karakter');
  const salt=randomBytes(24);
  const digest=pbkdf2Sync(plain,salt,100000,32,'sha256');
  return 'pbkdf2_sha256$100000$'+salt.toString('base64url')+'$'+digest.toString('base64url');
};

export const verifyPassword=async (hash,plain)=>{
  if(typeof hash!=='string'||typeof plain!=='string'||plain.length>200)return false;
  if(hash.startsWith('$argon2id$'))return argon2.verify(hash,plain);
  const [name,rounds,salt,digest,...extra]=hash.split('$');
  if(name!=='pbkdf2_sha256'||Number(rounds)!==100000||!salt||!digest||extra.length)return false;
  try{
    const expected=Buffer.from(digest,'base64url');
    const saltBytes=Buffer.from(salt,'base64url');
    if(expected.length!==32||saltBytes.length<16)return false;
    return timingSafeEqual(expected,pbkdf2Sync(plain,saltBytes,100000,32,'sha256'));
  }catch{return false}
};
